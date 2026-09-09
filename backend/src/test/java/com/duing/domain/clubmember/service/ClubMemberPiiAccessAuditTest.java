package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * 회장 경로 개인정보 열람 감사 영속화 회귀(#754).
 *
 * <p>테스트 트랜잭션을 두지 않는 {@link IntegrationTestBase} 를 상속해 서비스가 스스로 트랜잭션을 연다 —
 * 클래스 레벨 {@code @Transactional} 테스트에서는 서비스가 테스트의 쓰기 트랜잭션에 참여해버려
 * readOnly 오버라이드 누락(실제 PG 에서 INSERT 거부)을 잡지 못한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubMemberPiiAccessAuditTest extends IntegrationTestBase {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired ClubMemberQueryService clubMemberQueryService;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    @Test
    @DisplayName("운영진이 멤버 번호를 조회하면 MEMBER_PHONE_VIEWED 감사 행이 남고 detail 에 memberId·userId 만 실린다")
    void phoneViewLeavesAuditRowWithIdsOnly() throws Exception {
        Club club = saveActiveClub("감사번호조회");
        User leader = userRepository.save(UserFixture.unique());
        User targetUser = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember targetMember = clubMemberRepository.save(ClubMember.asMember(club, targetUser));

        String phone = clubMemberQueryService.getMemberPhone(club.getId(), targetMember.getId(), leader.getId());

        assertThat(phone).isEqualTo(targetUser.getPhone());
        List<ClubAuditEvent> auditEvents = clubAuditEventRepository.findAll();
        assertThat(auditEvents).hasSize(1);
        ClubAuditEvent auditEvent = auditEvents.getFirst();
        assertThat(auditEvent.getEventType()).isEqualTo(ClubAuditEventType.MEMBER_PHONE_VIEWED);
        assertThat(auditEvent.getClubId()).isEqualTo(club.getId());
        assertThat(auditEvent.getActorUserId()).isEqualTo(leader.getId());
        JsonNode detail = OBJECT_MAPPER.readTree(auditEvent.getDetail());
        assertThat(detail.get("memberId").asLong()).isEqualTo(targetMember.getId());
        assertThat(detail.get("userId").asLong()).isEqualTo(targetUser.getId());
        assertThat(auditEvent.getDetail()).doesNotContain(targetUser.getPhone());
    }

    @Test
    @DisplayName("명단을 번호 포함으로 내보내면 MEMBER_LIST_EXPORTED 감사 행에 includePhone=true·count 가 남는다")
    void exportLeavesAuditRowWithIncludePhoneAndCount() throws Exception {
        Club club = saveActiveClub("감사명단내보내기");
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember firstMember = clubMemberRepository.save(
                ClubMember.asMember(club, userRepository.save(UserFixture.unique())));
        ClubMember secondMember = clubMemberRepository.save(
                ClubMember.asMember(club, userRepository.save(UserFixture.unique())));

        clubMemberQueryService.getMembersForExport(
                club.getId(), leader.getId(), true, List.of(firstMember.getId(), secondMember.getId()));

        List<ClubAuditEvent> auditEvents = clubAuditEventRepository.findAll();
        assertThat(auditEvents).hasSize(1);
        ClubAuditEvent auditEvent = auditEvents.getFirst();
        assertThat(auditEvent.getEventType()).isEqualTo(ClubAuditEventType.MEMBER_LIST_EXPORTED);
        assertThat(auditEvent.getClubId()).isEqualTo(club.getId());
        assertThat(auditEvent.getActorUserId()).isEqualTo(leader.getId());
        JsonNode detail = OBJECT_MAPPER.readTree(auditEvent.getDetail());
        assertThat(detail.get("includePhone").asBoolean()).isTrue();
        assertThat(detail.get("scoped").asBoolean()).isTrue();
        assertThat(detail.get("count").asInt()).isEqualTo(2);
    }

    @Test
    @DisplayName("존재하지 않는 멤버 번호 조회는 404 로 끝나고 감사 행을 남기지 않는다")
    void missingMemberLeavesNoAuditRow() {
        Club club = saveActiveClub("감사미존재대상");
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubMemberQueryService.getMemberPhone(club.getId(), 999_999L, leader.getId()))
                .isInstanceOf(ClubMemberException.NotFound.class);

        assertThat(clubAuditEventRepository.count()).isZero();
    }

    // 운영 행위 게이트가 ACTIVE 동아리만 허용하므로(ClubAuthService.requireManager) 승인 상태로 만들어 둔다.
    private Club saveActiveClub(String name) {
        Club club = ClubFixture.academic(name);
        club.changeStatus(ClubStatus.ACTIVE, null, null);
        return clubRepository.save(club);
    }
}
