package com.duing.domain.club.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.joincode.entity.ClubJoinCode;
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
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 운영 중단 동아리 남은 미결 판정(스펙 §3-1) — 총동연 목록 필터·행 건수·홈 집계가 쓰는 ClubRepositoryImpl 조각.
 * 삭제·탈퇴를 jdbc 로 찍으므로 테스트 트랜잭션을 두지 않는다 — 1차 캐시가 DB 와 갈리지 않게(정리는 IntegrationTestBase 가 한다).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubRepositoryImplPendingItemsTest extends IntegrationTestBase {

    private static final PageRequest FIRST_PAGE = PageRequest.of(0, 100);

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    @Test
    @DisplayName("남은 미결 필터는 정리할 것이 있는 운영 중단 동아리만 돌려준다 — 지원서만·가입 신청만 있어도 포함하고, 남은 것이 없는 운영 중단·남은 것이 있는 운영 중 동아리는 뺀다")
    void filterReturnsOnlyInactiveClubsWithPendingItems() {
        LocalDate today = LocalDate.now(clock);
        Club applicationOnlyClub = saveClub(ClubStatus.INACTIVE);
        saveApplication(saveRecruitment(applicationOnlyClub, today, true), ApplicationStatus.SUBMITTED);
        Club joinRequestOnlyClub = saveClub(ClubStatus.INACTIVE);
        ClubJoinCode joinCode = saveJoinCode(joinRequestOnlyClub, saveRecruitment(joinRequestOnlyClub, today, true));
        savePendingJoinRequest(joinRequestOnlyClub, joinCode, saveUser());
        Club inactiveWithoutPendingClub = saveClub(ClubStatus.INACTIVE);
        saveApplication(saveRecruitment(inactiveWithoutPendingClub, today, true), ApplicationStatus.REJECTED);
        Club activeWithPendingClub = saveClub(ClubStatus.ACTIVE);
        Recruitment activeRecruitment = saveRecruitment(activeWithPendingClub, today, false);
        saveApplication(activeRecruitment, ApplicationStatus.SUBMITTED);
        savePendingJoinRequest(activeWithPendingClub, saveJoinCode(activeWithPendingClub, activeRecruitment), saveUser());

        Page<AdminClubSummaryQuery> page = clubRepository.findByAdminCondition(condition(null, true), FIRST_PAGE);

        assertThat(page.getContent()).extracting(AdminClubSummaryQuery::id)
                .containsExactlyInAnyOrder(applicationOnlyClub.getId(), joinRequestOnlyClub.getId());
        assertThat(page.getTotalElements()).isEqualTo(2);
    }

    @Test
    @DisplayName("남은 미결 필터는 상태 필터와 함께 걸린다 — 운영 중단을 고르면 같은 결과, 다른 상태를 고르면 빈 결과다")
    void filterCombinesWithStatusFilter() {
        LocalDate today = LocalDate.now(clock);
        Club inactiveClub = saveClub(ClubStatus.INACTIVE);
        saveApplication(saveRecruitment(inactiveClub, today, true), ApplicationStatus.SUBMITTED);
        Club activeClub = saveClub(ClubStatus.ACTIVE);
        saveApplication(saveRecruitment(activeClub, today, false), ApplicationStatus.SUBMITTED);

        assertThat(clubRepository.findByAdminCondition(condition(ClubStatus.INACTIVE, true), FIRST_PAGE).getContent())
                .extracting(AdminClubSummaryQuery::id)
                .containsExactly(inactiveClub.getId());
        assertThat(clubRepository.findByAdminCondition(condition(ClubStatus.ACTIVE, true), FIRST_PAGE).getTotalElements())
                .isZero();
    }

    @Test
    @DisplayName("행 건수는 운영 중단 동아리만 채우고(0 포함) 다른 상태는 null 이다 — 삭제된 모집·지원서는 빼고 탈퇴한 사람의 지원서·신청은 센다")
    void rowCountsFillOnlyInactiveClubs() {
        LocalDate today = LocalDate.now(clock);
        Club inactiveClub = saveClub(ClubStatus.INACTIVE);
        Recruitment openRecruitment = saveRecruitment(inactiveClub, today, false);
        Recruitment closedRecruitment = saveRecruitment(inactiveClub, today, true);
        saveApplication(openRecruitment, ApplicationStatus.SUBMITTED);
        saveApplication(closedRecruitment, ApplicationStatus.ON_HOLD);
        saveApplication(closedRecruitment, ApplicationStatus.INTERVIEW_PENDING);
        saveApplication(closedRecruitment, ApplicationStatus.ACCEPTED);
        saveApplication(closedRecruitment, ApplicationStatus.REJECTED);
        softDelete("application", saveApplication(openRecruitment, ApplicationStatus.SUBMITTED).getId());
        Recruitment deletedRecruitment = saveRecruitment(inactiveClub, today, true);
        saveApplication(deletedRecruitment, ApplicationStatus.SUBMITTED);
        softDelete("recruitment", deletedRecruitment.getId());
        User withdrawnApplicant = saveUser();
        PendingItemsFixture.saveApplication(applicationRepository, closedRecruitment, withdrawnApplicant,
                ApplicationStatus.SUBMITTED);
        ClubJoinCode joinCode = saveJoinCode(inactiveClub, closedRecruitment);
        savePendingJoinRequest(inactiveClub, joinCode, saveUser());
        User withdrawnRequester = saveUser();
        savePendingJoinRequest(inactiveClub, joinCode, withdrawnRequester);
        User reviewer = userRepository.save(UserFixture.admin());
        LocalDateTime reviewedAt = LocalDateTime.now(clock).minusDays(1);
        PendingItemsFixture.saveProcessedJoinRequest(clubJoinRequestRepository, inactiveClub, joinCode, saveUser(),
                reviewer, JoinRequestStatus.APPROVED, reviewedAt);
        PendingItemsFixture.saveProcessedJoinRequest(clubJoinRequestRepository, inactiveClub, joinCode, saveUser(),
                reviewer, JoinRequestStatus.REJECTED, reviewedAt);
        softDelete("users", withdrawnApplicant.getId());
        softDelete("users", withdrawnRequester.getId());
        Club emptyInactiveClub = saveClub(ClubStatus.INACTIVE);
        Club activeClub = saveClub(ClubStatus.ACTIVE);
        saveApplication(saveRecruitment(activeClub, today, false), ApplicationStatus.SUBMITTED);
        Club pendingApprovalClub = saveClub(ClubStatus.PENDING_APPROVAL);

        Map<Long, AdminClubSummaryQuery> rowsById = clubRepository
                .findByAdminCondition(condition(null, false), FIRST_PAGE).getContent().stream()
                .collect(Collectors.toMap(AdminClubSummaryQuery::id, Function.identity()));

        assertThat(rowsById.get(inactiveClub.getId()))
                .extracting(AdminClubSummaryQuery::undecidedApplicationCount, AdminClubSummaryQuery::pendingJoinRequestCount)
                .as("[제출·보류·면접 대기 + 탈퇴한 지원자 = 4, 대기 신청 + 탈퇴한 신청자 = 2]")
                .containsExactly(4L, 2L);
        assertThat(rowsById.get(emptyInactiveClub.getId()))
                .extracting(AdminClubSummaryQuery::undecidedApplicationCount, AdminClubSummaryQuery::pendingJoinRequestCount)
                .as("운영 중단이면 0 도 값으로 싣는다")
                .containsExactly(0L, 0L);
        assertThat(rowsById.get(activeClub.getId()))
                .extracting(AdminClubSummaryQuery::undecidedApplicationCount, AdminClubSummaryQuery::pendingJoinRequestCount)
                .containsExactly(null, null);
        assertThat(rowsById.get(pendingApprovalClub.getId()))
                .extracting(AdminClubSummaryQuery::undecidedApplicationCount, AdminClubSummaryQuery::pendingJoinRequestCount)
                .containsExactly(null, null);
    }

    @Test
    @DisplayName("운영 중단 미결 동아리 수는 같은 데이터에서 필터 결과의 totalElements 와 같다 — 폐쇄된 동아리·삭제된 데이터만 남은 동아리는 빠지고 탈퇴자만 남은 동아리는 든다")
    void countEqualsFilterTotalElements() {
        LocalDate today = LocalDate.now(clock);
        Club applicationOnlyClub = saveClub(ClubStatus.INACTIVE);
        saveApplication(saveRecruitment(applicationOnlyClub, today, true), ApplicationStatus.SUBMITTED);
        Club joinRequestOnlyClub = saveClub(ClubStatus.INACTIVE);
        savePendingJoinRequest(joinRequestOnlyClub,
                saveJoinCode(joinRequestOnlyClub, saveRecruitment(joinRequestOnlyClub, today, true)), saveUser());
        Club withdrawnOnlyClub = saveClub(ClubStatus.INACTIVE);
        User withdrawnApplicant = saveUser();
        PendingItemsFixture.saveApplication(applicationRepository, saveRecruitment(withdrawnOnlyClub, today, true),
                withdrawnApplicant, ApplicationStatus.ON_HOLD);
        softDelete("users", withdrawnApplicant.getId());
        Club deletedDataOnlyClub = saveClub(ClubStatus.INACTIVE);
        Recruitment deletedRecruitment = saveRecruitment(deletedDataOnlyClub, today, true);
        saveApplication(deletedRecruitment, ApplicationStatus.SUBMITTED);
        softDelete("recruitment", deletedRecruitment.getId());
        softDelete("application",
                saveApplication(saveRecruitment(deletedDataOnlyClub, today, true), ApplicationStatus.SUBMITTED).getId());
        Club closedClub = saveClub(ClubStatus.INACTIVE);
        saveApplication(saveRecruitment(closedClub, today, true), ApplicationStatus.SUBMITTED);
        softDelete("club", closedClub.getId());
        Club activeClub = saveClub(ClubStatus.ACTIVE);
        saveApplication(saveRecruitment(activeClub, today, false), ApplicationStatus.SUBMITTED);

        long count = clubRepository.countInactiveClubsWithPendingItems();
        Page<AdminClubSummaryQuery> page = clubRepository.findByAdminCondition(condition(null, true), FIRST_PAGE);

        assertThat(count).isEqualTo(page.getTotalElements()).isEqualTo(3);
        assertThat(page.getContent()).extracting(AdminClubSummaryQuery::id)
                .containsExactlyInAnyOrder(applicationOnlyClub.getId(), joinRequestOnlyClub.getId(), withdrawnOnlyClub.getId());
    }

    private AdminClubSearchCondition condition(ClubStatus status, boolean needsPendingCleanup) {
        return new AdminClubSearchCondition(status, null, null, null, needsPendingCleanup);
    }

    private Club saveClub(ClubStatus status) {
        return PendingItemsFixture.saveClub(clubRepository, status);
    }

    private Recruitment saveRecruitment(Club club, LocalDate today, boolean closed) {
        return PendingItemsFixture.saveRecruitment(recruitmentRepository, club, today, closed);
    }

    private Application saveApplication(Recruitment recruitment, ApplicationStatus status) {
        return PendingItemsFixture.saveApplication(applicationRepository, recruitment, saveUser(), status);
    }

    private ClubJoinCode saveJoinCode(Club club, Recruitment recruitment) {
        return PendingItemsFixture.saveJoinCode(clubJoinCodeRepository, club, recruitment);
    }

    private void savePendingJoinRequest(Club club, ClubJoinCode joinCode, User requester) {
        PendingItemsFixture.savePendingJoinRequest(clubJoinCodeRepository, clubJoinRequestRepository,
                club, joinCode, requester);
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    /** soft-delete 를 jdbc 로 찍는다(@SQLDelete 를 거치지 않는 잔존 재현). 테이블 이름은 이 클래스의 상수 인자뿐이다. */
    private void softDelete(String tableName, Long id) {
        jdbcTemplate.update("UPDATE " + tableName + " SET deleted_at = NOW() WHERE id = ?", id);
    }
}
