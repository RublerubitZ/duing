package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.frontend.FrontendRevalidationAsyncConfig;
import com.duing.global.frontend.FrontendRevalidator;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 기간 종료 모집 자동 마감의 판정·마감 계약 — 종료일 다음 날부터 7일이 지났고 결과 없는 지원·진행 중 면접 라운드가 없는
 * OPEN 모집만 닫는다. 오늘은 {@link FixedClockConfig#TODAY}(2026-06-15 자정 KST)로 고정한다.
 *
 * <p>클래스에 {@code @Transactional} 을 두지 않는다 — 서비스의 모집별 트랜잭션이 실제로 커밋돼야 마감 결과와
 * 커밋 뒤(AFTER_COMMIT) 상세 재생성 요청을 그대로 볼 수 있다. 데이터는 {@link IntegrationTestBase} 가 매번 비운다.
 * 동아리당 OPEN 모집은 1건뿐이라(uk_recruitment_club_active) 모집마다 동아리를 따로 만든다.
 */
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest
class RecruitmentAutoCloseServiceTest extends IntegrationTestBase {

    private static final long ASYNC_WAIT_MS = 3_000;
    private static final long QUIET_WAIT_MS = 700;
    private static final LocalDate TODAY = FixedClockConfig.TODAY;
    /** 고정 시계의 {@code LocalDateTime.now(clock)} — 마감 스탬프 기대값. */
    private static final LocalDateTime FIXED_NOW = TODAY.atStartOfDay();

    @MockitoBean FrontendRevalidator frontendRevalidator;

    @Autowired RecruitmentAutoCloseService recruitmentAutoCloseService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired InterviewRoundRepository interviewRoundRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired @Qualifier(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME)
    ThreadPoolTaskExecutor frontendRevalidationTaskExecutor;

    private int clubSequence;

    @BeforeEach
    void setUp() throws InterruptedException {
        clubSequence = 0;
        drainRevalidationExecutor();
        clearInvocations(frontendRevalidator);
    }

    /** 앞 테스트가 남긴 비동기 재생성 요청이 끝날 때까지(활성 0·큐 비움) 최대 3초 기다린다. */
    private void drainRevalidationExecutor() throws InterruptedException {
        long deadline = System.currentTimeMillis() + ASYNC_WAIT_MS;
        while ((frontendRevalidationTaskExecutor.getActiveCount() > 0
                || frontendRevalidationTaskExecutor.getQueueSize() > 0)
                && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }

    private Club saveClub() {
        clubSequence++;
        return clubRepository.save(ClubFixture.academic("자동마감동아리" + clubSequence));
    }

    /** 자체 폼 기간 모집 — 종료일이 오늘보다 {@code daysSinceEnd} 일 앞이다. */
    private Recruitment saveOpenRecruitmentEndedDaysAgo(long daysSinceEnd) {
        LocalDate endDate = TODAY.minusDays(daysSinceEnd);
        return recruitmentRepository.save(
                Recruitment.create(saveClub(), "기간 모집", "내용", endDate.minusDays(14), endDate, 10));
    }

    private Recruitment saveAlwaysOpenRecruitment() {
        return recruitmentRepository.save(
                Recruitment.create(saveClub(), "상시 모집", "내용", TODAY.minusDays(60), null, 10));
    }

    private Recruitment saveExternalFormRecruitmentEndedDaysAgo(long daysSinceEnd) {
        LocalDate endDate = TODAY.minusDays(daysSinceEnd);
        return recruitmentRepository.save(Recruitment.createWithOptions(
                saveClub(), "외부 폼 모집", "내용", endDate.minusDays(14), endDate, 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false, TargetRole.MEMBER,
                null, null, false));
    }

    /** 지원서를 제출한 뒤 상태만 JDBC 로 옮긴다 — 전이 규칙(면접 단계 등)을 거치지 않고 결과 상태를 바로 만든다. */
    private Application saveApplication(Recruitment recruitment, ApplicationStatus status) {
        User applicant = userRepository.save(UserFixture.unique());
        Application application = applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
        jdbcTemplate.update("UPDATE application SET status = ? WHERE id = ?", status.name(), application.getId());
        return application;
    }

    private void saveRound(Recruitment recruitment, RoundStatus status) {
        interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), FIXED_NOW.minusDays(3), "학생회관 201호", status));
    }

    private Recruitment reload(Recruitment recruitment) {
        return recruitmentRepository.findById(recruitment.getId()).orElseThrow();
    }

    @Test
    @DisplayName("후보는 종료일 다음 날부터 7일이 지난 OPEN 모집뿐이고 상시모집·마감·삭제 모집과 7일째 모집은 빠진다")
    void candidatesAreOpenRecruitmentsEndedMoreThanGraceDaysAgo() {
        Recruitment eightDaysAfterEnd = saveOpenRecruitmentEndedDaysAgo(8);
        Recruitment sevenDaysAfterEnd = saveOpenRecruitmentEndedDaysAgo(7);
        Recruitment alwaysOpen = saveAlwaysOpenRecruitment();
        Recruitment alreadyClosed = saveOpenRecruitmentEndedDaysAgo(30);
        jdbcTemplate.update("UPDATE recruitment SET status = 'CLOSED', closed_at = ? WHERE id = ?",
                FIXED_NOW.minusDays(20), alreadyClosed.getId());
        Recruitment deleted = saveOpenRecruitmentEndedDaysAgo(30);
        jdbcTemplate.update("UPDATE recruitment SET deleted_at = NOW() WHERE id = ?", deleted.getId());
        Recruitment longAfterEnd = saveOpenRecruitmentEndedDaysAgo(40);

        List<Long> candidateIds = recruitmentAutoCloseService.findCandidateIds();

        assertThat(candidateIds).containsExactly(eightDaysAfterEnd.getId(), longAfterEnd.getId());
        assertThat(candidateIds).doesNotContain(
                sevenDaysAfterEnd.getId(), alwaysOpen.getId(), alreadyClosed.getId(), deleted.getId());
    }

    @Test
    @DisplayName("지원이 모두 합격·불합격으로 확정된 모집은 마감되고 마감 시각이 현재 시각으로 남는다")
    void closesRecruitmentWhoseApplicationsAreAllSettled() {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);
        saveApplication(recruitment, ApplicationStatus.ACCEPTED);
        saveApplication(recruitment, ApplicationStatus.REJECTED);

        boolean closed = recruitmentAutoCloseService.closeIfSettled(recruitment.getId());

        assertThat(closed).isTrue();
        Recruitment reloaded = reload(recruitment);
        assertThat(reloaded.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(reloaded.getClosedAt()).isEqualTo(FIXED_NOW);
    }

    @Test
    @DisplayName("지원이 한 건도 없는 모집은 마감된다")
    void closesRecruitmentWithoutApplications() {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isTrue();
        assertThat(reload(recruitment).getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
    }

    @Test
    @DisplayName("외부 폼 모집도 기간 종료 뒤 7일이 지나면 마감된다")
    void closesExternalFormRecruitment() {
        Recruitment recruitment = saveExternalFormRecruitmentEndedDaysAgo(8);

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isTrue();
        Recruitment reloaded = reload(recruitment);
        assertThat(reloaded.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(reloaded.getClosedAt()).isEqualTo(FIXED_NOW);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = ApplicationStatus.class, mode = EnumSource.Mode.EXCLUDE, names = {"ACCEPTED", "REJECTED"})
    @DisplayName("결과가 없는 지원이 한 건이라도 남은 모집은 마감하지 않는다")
    void keepsRecruitmentWithUnsettledApplication(ApplicationStatus unsettledStatus) {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);
        saveApplication(recruitment, ApplicationStatus.ACCEPTED);
        saveApplication(recruitment, unsettledStatus);

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isFalse();
        Recruitment reloaded = reload(recruitment);
        assertThat(reloaded.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
        assertThat(reloaded.getClosedAt()).isNull();
    }

    @Test
    @DisplayName("결과 없는 지원이 삭제된 것뿐이면 모집은 마감된다")
    void closesRecruitmentWhoseOnlyUnsettledApplicationIsDeleted() {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);
        Application deletedApplication = saveApplication(recruitment, ApplicationStatus.SUBMITTED);
        jdbcTemplate.update("UPDATE application SET deleted_at = NOW() WHERE id = ?", deletedApplication.getId());

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isTrue();
        assertThat(reload(recruitment).getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = RoundStatus.class, mode = EnumSource.Mode.EXCLUDE, names = {"SCHEDULED", "CANCELLED"})
    @DisplayName("진행 중인 면접 라운드가 있는 모집은 마감하지 않는다")
    void keepsRecruitmentWithInProgressRound(RoundStatus inProgressStatus) {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);
        saveRound(recruitment, inProgressStatus);

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isFalse();
        assertThat(reload(recruitment).getStatus()).isEqualTo(RecruitmentStatus.OPEN);
    }

    @Test
    @DisplayName("면접 라운드가 확정·취소된 것뿐이면 모집은 마감된다")
    void closesRecruitmentWithOnlyScheduledOrCancelledRounds() {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);
        saveRound(recruitment, RoundStatus.SCHEDULED);
        saveRound(recruitment, RoundStatus.CANCELLED);

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isTrue();
        assertThat(reload(recruitment).getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
    }

    @Test
    @DisplayName("이미 마감된 모집은 건드리지 않고 마감 시각도 바꾸지 않는다")
    void leavesAlreadyClosedRecruitmentUntouched() {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);
        LocalDateTime manuallyClosedAt = FIXED_NOW.minusDays(5);
        jdbcTemplate.update("UPDATE recruitment SET status = 'CLOSED', closed_at = ? WHERE id = ?",
                manuallyClosedAt, recruitment.getId());

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isFalse();
        assertThat(reload(recruitment).getClosedAt()).isEqualTo(manuallyClosedAt);
    }

    @Test
    @DisplayName("삭제된 모집은 마감하지 않는다")
    void leavesDeletedRecruitmentUntouched() {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);
        jdbcTemplate.update("UPDATE recruitment SET deleted_at = NOW() WHERE id = ?", recruitment.getId());

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isFalse();
        String storedStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM recruitment WHERE id = ?", String.class, recruitment.getId());
        assertThat(storedStatus).isEqualTo(RecruitmentStatus.OPEN.name());
    }

    @Test
    @DisplayName("종료일 다음 날부터 7일째인 모집은 아직 마감하지 않고 상세 재생성도 요청하지 않는다")
    void keepsRecruitmentOnLastGraceDay() {
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(7);

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isFalse();
        assertThat(reload(recruitment).getStatus()).isEqualTo(RecruitmentStatus.OPEN);
        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    @Test
    @DisplayName("자동 마감이 커밋되면 그 동아리 상세 재생성을 한 번 요청한다")
    void autoCloseRequestsClubDetailRevalidation() throws InterruptedException {
        // 동아리 id 를 모집 id 와 떼어 놓는다 — 테스트마다 id 가 1 부터라, 동아리 대신 모집 id 로 발행하는 변이가 가려진다.
        saveClub();
        saveClub();
        Recruitment recruitment = saveOpenRecruitmentEndedDaysAgo(8);
        Long clubId = recruitment.getClub().getId();
        assertThat(clubId).isNotEqualTo(recruitment.getId());

        assertThat(recruitmentAutoCloseService.closeIfSettled(recruitment.getId())).isTrue();

        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS)).revalidateWithoutAlert("/clubs/" + clubId);
        drainRevalidationExecutor();
        verifyNoMoreInteractions(frontendRevalidator);
    }
}
