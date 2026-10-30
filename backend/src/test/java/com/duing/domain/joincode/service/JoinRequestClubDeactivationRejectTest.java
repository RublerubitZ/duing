package com.duing.domain.joincode.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** 운영 중단 동아리 남은 미결 정리의 가입 신청 쪽(스펙 §4-1) — 서비스를 직접 부른다. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JoinRequestClubDeactivationRejectTest extends IntegrationTestBase {

    private static final String CLUB_DEACTIVATED_REJECT_REASON = "동아리 운영 중단";

    @Autowired JoinRequestService joinRequestService;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private LocalDate today;
    private User adminUser;

    @BeforeEach
    void setUp() {
        today = LocalDate.now(clock);
        adminUser = userRepository.save(UserFixture.admin());
    }

    @Test
    @DisplayName("운영 중단 정리는 그 동아리의 대기 가입 신청을 '동아리 운영 중단' 사유·총동연 처리자로 거절하고 자리를 돌려주며 거절 감사를 남긴다 — 탈퇴한 신청자의 신청도 포함")
    void rejectsPendingJoinRequestsOfClub() {
        Club club = PendingItemsFixture.saveClub(clubRepository, ClubStatus.INACTIVE);
        Recruitment recruitment = PendingItemsFixture.saveRecruitment(recruitmentRepository, club, today, true);
        ClubJoinCode joinCode = PendingItemsFixture.saveJoinCode(clubJoinCodeRepository, club, recruitment);
        ClubJoinRequest pending = savePendingJoinRequest(club, joinCode, saveUser());
        User withdrawnRequester = saveUser();
        ClubJoinRequest withdrawnRequesterPending = savePendingJoinRequest(club, joinCode, withdrawnRequester);
        jdbcTemplate.update("UPDATE users SET deleted_at = NOW() WHERE id = ?", withdrawnRequester.getId());
        LocalDateTime earlierReview = LocalDateTime.now(clock).minusDays(1);
        ClubJoinRequest approved = PendingItemsFixture.saveProcessedJoinRequest(clubJoinRequestRepository, club,
                joinCode, saveUser(), adminUser, JoinRequestStatus.APPROVED, earlierReview);
        ClubJoinRequest alreadyRejected = PendingItemsFixture.saveProcessedJoinRequest(clubJoinRequestRepository, club,
                joinCode, saveUser(), adminUser, JoinRequestStatus.REJECTED, earlierReview);
        Club otherClub = PendingItemsFixture.saveClub(clubRepository, ClubStatus.INACTIVE);
        ClubJoinCode otherJoinCode = PendingItemsFixture.saveJoinCode(clubJoinCodeRepository, otherClub,
                PendingItemsFixture.saveRecruitment(recruitmentRepository, otherClub, today, true));
        ClubJoinRequest otherClubPending = savePendingJoinRequest(otherClub, otherJoinCode, saveUser());
        int usedCountBefore = usedCountOf(joinCode);
        int otherUsedCountBefore = usedCountOf(otherJoinCode);

        int rejectedCount = joinRequestService.rejectAllPendingOnClubDeactivation(club.getId(), adminUser.getId());

        assertThat(rejectedCount).isEqualTo(2);
        JoinRequestRow cleaned = new JoinRequestRow("REJECTED", CLUB_DEACTIVATED_REJECT_REASON, adminUser.getId(), true);
        assertThat(rowOf(pending)).isEqualTo(cleaned);
        assertThat(rowOf(withdrawnRequesterPending)).as("탈퇴한 신청자의 신청").isEqualTo(cleaned);
        assertThat(rowOf(approved)).as("이미 승인").isEqualTo(new JoinRequestRow("APPROVED", null, adminUser.getId(), true));
        assertThat(rowOf(alreadyRejected)).as("이미 거절").isEqualTo(new JoinRequestRow("REJECTED", null, adminUser.getId(), true));
        assertThat(rowOf(otherClubPending)).as("다른 동아리").isEqualTo(new JoinRequestRow("PENDING", null, null, false));
        assertThat(usedCountOf(joinCode)).as("거절한 두 건의 자리를 돌려준다").isEqualTo(usedCountBefore - 2);
        assertThat(usedCountOf(otherJoinCode)).as("다른 동아리 링크는 그대로").isEqualTo(otherUsedCountBefore);
        assertThat(rejectionAuditCountOf(pending, joinCode, recruitment)).isEqualTo(1);
        assertThat(rejectionAuditCountOf(withdrawnRequesterPending, joinCode, recruitment)).isEqualTo(1);
        assertThat(countOf("SELECT COUNT(*) FROM club_audit_event WHERE event_type = 'JOIN_REQUEST_REJECTED'"))
                .as("거절 감사는 처리한 두 건뿐이다").isEqualTo(2);
    }

    @Test
    @DisplayName("모집 없는 부원 초대 링크로 들어온 대기 신청도 거절하고, 감사의 모집은 비워 두며, 그 링크의 자리를 하나 돌려준다")
    void rejectsPendingJoinRequestFromClubInviteLink() {
        Club club = PendingItemsFixture.saveClub(clubRepository, ClubStatus.INACTIVE);
        ClubJoinCode inviteCode = PendingItemsFixture.saveClubInviteCode(clubJoinCodeRepository, club,
                LocalDateTime.now(clock).plusDays(7));
        ClubJoinRequest invitePending = savePendingJoinRequest(club, inviteCode, saveUser());
        int usedCountBefore = usedCountOf(inviteCode);

        int rejectedCount = joinRequestService.rejectAllPendingOnClubDeactivation(club.getId(), adminUser.getId());

        assertThat(rejectedCount).isEqualTo(1);
        assertThat(rowOf(invitePending))
                .isEqualTo(new JoinRequestRow("REJECTED", CLUB_DEACTIVATED_REJECT_REASON, adminUser.getId(), true));
        assertThat(usedCountOf(inviteCode)).as("초대 링크의 자리 하나를 돌려준다").isEqualTo(usedCountBefore - 1);
        assertThat(countOf("SELECT COUNT(*) FROM club_audit_event WHERE event_type = 'JOIN_REQUEST_REJECTED' "
                        + "AND club_id = ? AND recruitment_id IS NULL AND join_code_id = ? AND join_request_id = ? "
                        + "AND actor_user_id = ?",
                club.getId(), inviteCode.getId(), invitePending.getId(), adminUser.getId()))
                .as("초대 링크 신청의 거절 감사는 모집이 비어 있다").isEqualTo(1);
    }

    @Test
    @DisplayName("대기 가입 신청이 없으면 처리자를 조회하지 않고 0 을 돌려준다")
    void returnsZeroWithoutActorLookupWhenNothingToReject() {
        Club club = PendingItemsFixture.saveClub(clubRepository, ClubStatus.INACTIVE);

        // 없는 처리자 id 로도 예외가 없다 — 대상이 없으면 처리자를 읽지 않는다.
        assertThat(joinRequestService.rejectAllPendingOnClubDeactivation(club.getId(), Long.MAX_VALUE)).isZero();
    }

    private record JoinRequestRow(String status, String rejectReason, Long reviewedBy, boolean reviewed) {
    }

    private JoinRequestRow rowOf(ClubJoinRequest joinRequest) {
        return jdbcTemplate.queryForObject(
                "SELECT status, reject_reason, reviewed_by, reviewed_at FROM club_join_request WHERE id = ?",
                (resultSet, rowNumber) -> new JoinRequestRow(
                        resultSet.getString("status"),
                        resultSet.getString("reject_reason"),
                        resultSet.getObject("reviewed_by", Long.class),
                        resultSet.getObject("reviewed_at") != null),
                joinRequest.getId());
    }

    private int usedCountOf(ClubJoinCode joinCode) {
        return countOf("SELECT used_count FROM club_join_code WHERE id = ?", joinCode.getId());
    }

    private int rejectionAuditCountOf(ClubJoinRequest joinRequest, ClubJoinCode joinCode, Recruitment recruitment) {
        return countOf("SELECT COUNT(*) FROM club_audit_event WHERE event_type = 'JOIN_REQUEST_REJECTED' "
                        + "AND club_id = ? AND recruitment_id = ? AND join_code_id = ? AND join_request_id = ? "
                        + "AND actor_user_id = ?",
                joinCode.getClub().getId(), recruitment.getId(), joinCode.getId(), joinRequest.getId(), adminUser.getId());
    }

    private int countOf(String sql, Object... arguments) {
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, arguments);
        return count == null ? 0 : count;
    }

    private ClubJoinRequest savePendingJoinRequest(Club club, ClubJoinCode joinCode, User requester) {
        return PendingItemsFixture.savePendingJoinRequest(clubJoinCodeRepository, clubJoinRequestRepository,
                club, joinCode, requester);
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }
}
