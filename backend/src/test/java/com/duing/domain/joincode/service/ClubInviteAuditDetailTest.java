package com.duing.domain.joincode.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.service.dto.command.CreateClubInviteCodeCommand;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** 부원 초대 발급 감사 detail(활동 이력 스펙 §2.2). 코드 값은 어디에도 남지 않아야 한다. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubInviteAuditDetailTest extends IntegrationTestBase {

    @Autowired JoinCodeService joinCodeService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("초대 발급은 자동승인·정원·만료(KST→절대시각)를 detail 에 남기고, 재발급 시 구 링크 폐기 행은 detail 이 비어 있다")
    void inviteIssueRecordsDetailSnapshotWithoutCode() {
        User leader = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("초대감사동아리"));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        JoinCodeQuery firstInvite = joinCodeService.createClubInvite(
                new CreateClubInviteCodeCommand(club.getId(), leader.getId(), 30, 72, true, 13));
        JoinCodeQuery secondInvite = joinCodeService.createClubInvite(
                new CreateClubInviteCodeCommand(club.getId(), leader.getId(), 10, 24, false, 13));

        List<Map<String, Object>> auditRows = jdbcTemplate.queryForList(
                "SELECT event_type, join_code_id, detail::text AS detail_text, "
                        + "detail->>'linkType' AS link_type, detail->>'autoApprove' AS auto_approve, "
                        + "detail->>'maxUses' AS max_uses, detail->>'expiresAt' AS expires_at "
                        + "FROM club_audit_event WHERE club_id = ? ORDER BY id",
                club.getId());
        assertThat(auditRows).extracting(row -> row.get("event_type"))
                .containsExactly("JOIN_LINK_CREATED", "JOIN_LINK_REVOKED", "JOIN_LINK_REGENERATED");

        ClubJoinCode storedFirst = clubJoinCodeRepository.findById(firstInvite.joinCodeId()).orElseThrow();
        Map<String, Object> created = auditRows.get(0);
        assertThat(((Number) created.get("join_code_id")).longValue()).isEqualTo(firstInvite.joinCodeId());
        assertThat(created.get("link_type")).isEqualTo("CLUB_INVITE");
        assertThat(created.get("auto_approve")).isEqualTo("true");
        assertThat(created.get("max_uses")).isEqualTo("30");
        // detail 은 메모리 값(나노초 가능)으로 만들고 DB 컬럼(timestamp)은 마이크로초로 절단되므로 같은 해상도로 맞춰 비교한다.
        assertThat(Instant.parse((String) created.get("expires_at")).truncatedTo(ChronoUnit.MICROS))
                .as("만료는 seoulClock 벽시계라 KST 환산이어야 한다")
                .isEqualTo(TimeMapper.seoulWallClockToInstant(storedFirst.getInviteExpiresAt()));
        assertThat((String) created.get("detail_text"))
                .doesNotContain(firstInvite.code(), secondInvite.code());

        assertThat(auditRows.get(1).get("detail_text")).as("폐기 행은 detail 을 갖지 않는다").isNull();

        Map<String, Object> regenerated = auditRows.get(2);
        assertThat(regenerated.get("auto_approve")).isEqualTo("false");
        assertThat(regenerated.get("max_uses")).isEqualTo("10");
        assertThat((String) regenerated.get("detail_text")).doesNotContain(secondInvite.code());
    }
}
