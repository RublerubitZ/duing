package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 동아리 상태 전이·폐쇄가 club_audit_event 에 남는지 검증한다(활동 이력 스펙 §2.1).
 * detail 은 jsonb 라 공백·키 순서가 정규화되므로 문자열 비교 대신 {@code detail->>'키'} 로 읽는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubStatusAuditInstrumentationTest extends IntegrationTestBase {

    @Autowired ClubService clubService;
    @Autowired ClubClosureService clubClosureService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("거절 뒤 재심사 대기로 되돌려도 첫 거절 사유는 감사 로그에 남고, 거절이 아닌 전이는 사유가 비어 있다")
    void statusTransitionsKeepRejectionReasonOnlyOnReject() {
        User admin = userRepository.save(UserFixture.admin());
        Club club = clubRepository.save(ClubFixture.academic("상태감사동아리"));

        clubService.updateStatus(new UpdateClubStatusCommand(
                club.getId(), ClubStatus.REJECTED, "서류 미비", admin.getId()));
        clubService.updateStatus(new UpdateClubStatusCommand(
                club.getId(), ClubStatus.PENDING_APPROVAL, null, admin.getId()));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT rejection_reason FROM club WHERE id = ?", String.class, club.getId()))
                .as("엔티티의 최신값은 지워진다 — 이력은 감사 테이블이 맡는다")
                .isNull();

        List<Map<String, Object>> statusEvents = jdbcTemplate.queryForList(
                "SELECT reason, actor_user_id, detail->>'from' AS from_status, detail->>'to' AS to_status "
                        + "FROM club_audit_event WHERE club_id = ? AND event_type = 'CLUB_STATUS_CHANGED' ORDER BY id",
                club.getId());
        assertThat(statusEvents).hasSize(2);

        Map<String, Object> rejected = statusEvents.get(0);
        assertThat(rejected.get("reason")).isEqualTo("서류 미비");
        assertThat(rejected.get("from_status")).isEqualTo("PENDING_APPROVAL");
        assertThat(rejected.get("to_status")).isEqualTo("REJECTED");
        assertThat(((Number) rejected.get("actor_user_id")).longValue()).isEqualTo(admin.getId());

        Map<String, Object> reopened = statusEvents.get(1);
        assertThat(reopened.get("reason")).as("REJECTED 가 아닌 전이는 사유를 남기지 않는다").isNull();
        assertThat(reopened.get("from_status")).isEqualTo("REJECTED");
        assertThat(reopened.get("to_status")).isEqualTo("PENDING_APPROVAL");
    }

    @Test
    @DisplayName("동아리 폐쇄는 폐쇄 사유가 담긴 CLUB_CLOSED 감사 행을 남기고, 폐쇄된 동아리 id 를 가리킨다")
    void closureRecordsClubClosedWithReason() {
        User admin = userRepository.save(UserFixture.admin());
        User leader = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("폐쇄감사동아리"));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        // 폐쇄는 비 ACTIVE 동아리에서만 시작된다(validateClosable).
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        clubClosureService.close(new CloseClubCommand(club.getId(), admin.getId(), "활동 중단 장기화"));

        Map<String, Object> closedEvent = jdbcTemplate.queryForMap(
                "SELECT reason, actor_user_id FROM club_audit_event WHERE club_id = ? AND event_type = 'CLUB_CLOSED'",
                club.getId());
        assertThat(closedEvent.get("reason")).isEqualTo("활동 중단 장기화");
        assertThat(((Number) closedEvent.get("actor_user_id")).longValue()).isEqualTo(admin.getId());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM club WHERE id = ?", Boolean.class, club.getId()))
                .as("soft-delete 된 뒤에도 club 행이 남아 감사 FK 가 성립한다")
                .isTrue();
    }
}
