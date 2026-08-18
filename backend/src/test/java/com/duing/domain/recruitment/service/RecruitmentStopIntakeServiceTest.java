package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubVisibilityPolicy;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;

/**
 * 상시모집 접수 마감(stopIntake) — endDate 를 어제로 확정해 만료-OPEN(심사 기간)으로 전환한다 (#888).
 * status 는 OPEN 을 유지해 기존 지원자 심사·면접은 계속 가능하고, 신규 지원 판정(isEffectivelyOpen)만 닫힌다.
 */
class RecruitmentStopIntakeServiceTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final ClubJoinCodeRepository clubJoinCodeRepository = mock(ClubJoinCodeRepository.class);
    private final ClubJoinRequestRepository clubJoinRequestRepository = mock(ClubJoinRequestRepository.class);
    private final ClubAuditEventRepository clubAuditEventRepository = mock(ClubAuditEventRepository.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);

    private final GeneralRecruitmentService recruitmentService = new GeneralRecruitmentService(
            recruitmentRepository,
            applicationRepository,
            clubJoinCodeRepository,
            clubJoinRequestRepository,
            clubAuditEventRepository,
            clubRepository,
            clubAuthService,
            new ClubVisibilityPolicy(clubRepository),
            eventPublisher,
            // 실제 빈(seoulClock)과 동일한 Asia/Seoul 존 — systemDefaultZone 은 환경 의존.
            Clock.system(KST)
    );

    private static final Long MANAGER_USER_ID = 1L;
    private static final Long MEMBER_USER_ID = 2L;
    private static final Long RECRUITMENT_ID = 10L;
    private static final Long CLUB_ID = 100L;

    private Club club;

    @BeforeEach
    void setUp() {
        club = Club.create("두잉 동아리", ClubCategory.ACADEMIC, "공과대학", "설명", null);
        setField(club, "id", CLUB_ID);
    }

    private Recruitment alwaysOpenRecruitment(LocalDate startDate) {
        Recruitment recruitment = Recruitment.create(club, "상시 모집", "내용", startDate, null, 10);
        setField(recruitment, "id", RECRUITMENT_ID);
        return recruitment;
    }

    private static void setField(Object target, String fieldName, Object value) {
        try {
            Class<?> clazz = target.getClass();
            while (clazz != null) {
                try {
                    Field field = clazz.getDeclaredField(fieldName);
                    field.setAccessible(true);
                    field.set(target, value);
                    return;
                } catch (NoSuchFieldException e) {
                    clazz = clazz.getSuperclass();
                }
            }
            throw new RuntimeException("필드를 찾을 수 없습니다: " + fieldName);
        } catch (IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }

    private static UpdateRecruitmentCommand updateCommand(String title, LocalDate endDate) {
        return new UpdateRecruitmentCommand(
                RECRUITMENT_ID,
                MANAGER_USER_ID,
                title,
                null,
                null,
                endDate,
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );
    }

    @Test
    @DisplayName("시작일이 지난 상시모집의 접수를 마감하면 종료일이 어제로 확정되고 OPEN 상태는 유지된다")
    void stopIntakeFixesEndDateToYesterdayAndKeepsStatusOpen() {
        LocalDate kstToday = LocalDate.now(KST);
        Recruitment recruitment = alwaysOpenRecruitment(kstToday.minusDays(10));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID);

        assertThat(recruitment.getEndDate()).isEqualTo(kstToday.minusDays(1));
        assertThat(recruitment.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
        assertThat(recruitment.getClosedAt())
                .as("접수 마감은 모집 종료(close)가 아니다 — closedAt 은 스탬프하지 않는다").isNull();
    }

    @Test
    @DisplayName("접수 마감 즉시 신규 지원 판정이 닫히고 표시 상태는 CLOSED 로 도출된다")
    void stopIntakeImmediatelyClosesEligibilityAndDisplayStatus() {
        LocalDate kstToday = LocalDate.now(KST);
        Recruitment recruitment = alwaysOpenRecruitment(kstToday.minusDays(10));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID);

        assertThat(recruitment.isEffectivelyOpen(kstToday)).isFalse();
        assertThat(RecruitmentDisplayStatus.resolve(
                recruitment.getStatus(), recruitment.getStartDate(), recruitment.getEndDate(), kstToday))
                .isEqualTo(RecruitmentDisplayStatus.CLOSED);
    }

    @Test
    @DisplayName("모집 시작일 당일에는 접수를 마감할 수 없고 데이터가 변하지 않는다")
    void stopIntakeOnStartDateIsRejected() {
        Recruitment recruitment = alwaysOpenRecruitment(LocalDate.now(KST));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.StopIntakeTooEarlyException.class);
        assertThat(recruitment.getEndDate()).isNull();
        assertThat(recruitment.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
    }

    @Test
    @DisplayName("시작일이 오늘 이후인 상시모집도 접수를 마감할 수 없다")
    void stopIntakeBeforeStartDateIsRejected() {
        Recruitment recruitment = alwaysOpenRecruitment(LocalDate.now(KST).plusDays(3));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.StopIntakeTooEarlyException.class);
        assertThat(recruitment.getEndDate()).isNull();
    }

    @Test
    @DisplayName("기간모집에 접수 마감을 호출하면 상시모집 전용 안내로 거절된다")
    void stopIntakeOnFixedPeriodRecruitmentIsRejected() {
        LocalDate kstToday = LocalDate.now(KST);
        Recruitment recruitment = alwaysOpenRecruitment(kstToday.minusDays(10));
        setField(recruitment, "endDate", kstToday.plusDays(7));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.StopIntakeRequiresAlwaysOpenException.class);
        assertThat(recruitment.getEndDate()).isEqualTo(kstToday.plusDays(7));
    }

    @Test
    @DisplayName("종료일이 이미 지난 만료-OPEN 기간모집도 접수 마감 대상이 아니다")
    void stopIntakeOnExpiredOpenRecruitmentIsRejected() {
        LocalDate kstToday = LocalDate.now(KST);
        Recruitment recruitment = alwaysOpenRecruitment(kstToday.minusDays(10));
        setField(recruitment, "endDate", kstToday.minusDays(3));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.StopIntakeRequiresAlwaysOpenException.class);
    }

    @Test
    @DisplayName("이미 접수를 마감한 모집에 다시 호출하면 상시모집 전용 안내로 거절되고 종료일이 유지된다")
    void stopIntakeTwiceIsRejectedOnSecondCall() {
        LocalDate kstToday = LocalDate.now(KST);
        Recruitment recruitment = alwaysOpenRecruitment(kstToday.minusDays(10));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID);

        assertThatThrownBy(() -> recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.StopIntakeRequiresAlwaysOpenException.class);
        assertThat(recruitment.getEndDate()).isEqualTo(kstToday.minusDays(1));
    }

    @Test
    @DisplayName("마감(CLOSED)된 상시모집에 접수 마감을 호출하면 409 마감 예외가 우선한다")
    void stopIntakeOnClosedRecruitmentThrowsAlreadyClosed() {
        Recruitment recruitment = alwaysOpenRecruitment(LocalDate.now(KST).minusDays(10));
        setField(recruitment, "status", RecruitmentStatus.CLOSED);
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.RecruitmentAlreadyClosedException.class);
        assertThat(recruitment.getEndDate()).isNull();
    }

    @Test
    @DisplayName("존재하지 않는 모집에 접수 마감을 호출하면 404 예외가 발생한다")
    void stopIntakeOnMissingRecruitmentThrowsNotFound() {
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID))
                .isInstanceOf(RecruitmentException.RecruitmentNotFoundException.class);
    }

    @Test
    @DisplayName("동아리 운영진이 아닌 일반 회원이 접수 마감을 시도하면 403 예외가 발생하고 데이터가 변하지 않는다")
    void memberCannotStopIntake() {
        Recruitment recruitment = alwaysOpenRecruitment(LocalDate.now(KST).minusDays(10));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(MEMBER_USER_ID, CLUB_ID);

        assertThatThrownBy(() -> recruitmentService.stopIntake(RECRUITMENT_ID, MEMBER_USER_ID))
                .isInstanceOf(AccessDeniedException.class);
        assertThat(recruitment.getEndDate()).isNull();
    }

    @Test
    @DisplayName("접수 마감 후 종료일을 미래로 수정하면 접수가 재개된다 — 의도된 undo 경로")
    void reopeningIntakeWithFutureEndDateIsAllowed() {
        LocalDate kstToday = LocalDate.now(KST);
        Recruitment recruitment = alwaysOpenRecruitment(kstToday.minusDays(10));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID);
        recruitmentService.update(updateCommand(null, kstToday.plusDays(7)));

        assertThat(recruitment.getEndDate()).isEqualTo(kstToday.plusDays(7));
        assertThat(recruitment.isEffectivelyOpen(kstToday)).isTrue();
    }

    @Test
    @DisplayName("접수 마감 후 종료일 없이 다른 필드만 수정하면 확정된 종료일이 유지된다 — 상시모집 복귀는 표현 불가")
    void updateWithoutEndDateAfterStopIntakeKeepsFixedEndDate() {
        LocalDate kstToday = LocalDate.now(KST);
        Recruitment recruitment = alwaysOpenRecruitment(kstToday.minusDays(10));
        when(recruitmentRepository.findByIdForUpdate(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        recruitmentService.stopIntake(RECRUITMENT_ID, MANAGER_USER_ID);
        recruitmentService.update(updateCommand("심사 중 제목 수정", null));

        assertThat(recruitment.getTitle()).isEqualTo("심사 중 제목 수정");
        assertThat(recruitment.getEndDate()).isEqualTo(kstToday.minusDays(1));
    }
}
