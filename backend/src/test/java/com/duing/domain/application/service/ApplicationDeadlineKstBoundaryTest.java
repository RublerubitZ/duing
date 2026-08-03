package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.clubmember.service.ClubMemberEnrollmentService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepositoryCustom;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 모집 마감 경계의 KST 판정 회귀 테스트.
 * prod JVM 은 UTC 라서 무클럭 LocalDate.now() 를 쓰면 마감일 다음날 KST 00:00~08:59 에도
 * 지원이 허용되는 버그가 있었다 — 판정이 주입된 seoulClock 기준으로 이뤄지는지 고정 Clock 으로 검증한다.
 */
class ApplicationDeadlineKstBoundaryTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Long RECRUITMENT_ID = 1L;
    private static final Long USER_ID = 10L;
    private static final Long CLUB_ID = 99L;

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);

    // 상대 날짜 기준 — 절대 미래 날짜 하드코딩 금지 (시한폭탄 CI 전례).
    private final LocalDate deadline = LocalDate.now(SEOUL);

    @Test
    @DisplayName("마감일 당일 KST 23:59 에는 지원 가능 여부 확인이 통과한다")
    void eligibilityPassesUntilKstEndOfDeadlineDay() {
        stubOpenRecruitmentEndingOnDeadline();
        stubEligibleApplicant();
        Clock kstEndOfDeadlineDay = Clock.fixed(
                deadline.atTime(23, 59).atZone(SEOUL).toInstant(), SEOUL);

        assertThatCode(() -> serviceWithClock(kstEndOfDeadlineDay).checkEligibility(USER_ID, RECRUITMENT_ID))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("마감일 다음날 KST 자정 직후에는 UTC 날짜가 아직 마감일이어도 지원이 거부된다")
    void eligibilityRejectedRightAfterKstMidnight() {
        stubOpenRecruitmentEndingOnDeadline();
        // KST 00:30 = UTC 전날 15:30 — 무클럭 now() 였다면 today 가 여전히 마감일이라 통과했을 시각.
        Clock kstJustAfterMidnight = Clock.fixed(
                deadline.plusDays(1).atTime(0, 30).atZone(SEOUL).toInstant(), SEOUL);

        assertThrows(ApplicationDomainException.RecruitmentClosedException.class,
                () -> serviceWithClock(kstJustAfterMidnight).checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    private void stubOpenRecruitmentEndingOnDeadline() {
        Club activeClub = mock(Club.class);
        when(activeClub.getStatus()).thenReturn(ClubStatus.ACTIVE);
        when(activeClub.getId()).thenReturn(CLUB_ID);
        Recruitment recruitment = Recruitment.createWithOptions(
                activeClub,
                "마감 경계 모집",
                "내용",
                deadline.minusDays(10),
                deadline,
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                null,
                null,
                false);
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
    }

    private void stubEligibleApplicant() {
        User user = mock(User.class);
        when(user.getId()).thenReturn(USER_ID);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(applicationRepository.existsByRecruitmentIdAndUserId(RECRUITMENT_ID, USER_ID)).thenReturn(false);
        when(clubMemberRepository.findByClubIdAndUserId(CLUB_ID, USER_ID)).thenReturn(Optional.empty());
    }

    private GeneralApplicationService serviceWithClock(Clock fixedClock) {
        return new GeneralApplicationService(
                applicationRepository,
                recruitmentRepository,
                userRepository,
                clubMemberRepository,
                mock(ClubAuthService.class),
                mock(ClubMemberEnrollmentService.class),
                mock(ApplicationDraftService.class),
                mock(ApplicationStatusHistoryRepository.class),
                mock(ApplicationEvaluationRepository.class),
                mock(InterviewAvailabilityRepository.class),
                mock(InterviewScheduleRepository.class),
                mock(InterviewRoundRepository.class),
                mock(InterviewSlotRepository.class),
                mock(InterviewRoundMemberRepositoryCustom.class),
                fixedClock);
    }
}
