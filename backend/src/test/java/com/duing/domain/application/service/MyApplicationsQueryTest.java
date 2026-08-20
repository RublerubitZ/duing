package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.controller.ApplicationScope;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.clubmember.service.ClubMemberEnrollmentService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepositoryCustom;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MyApplicationsQueryTest {

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final ClubMemberEnrollmentService clubMemberEnrollmentService = mock(ClubMemberEnrollmentService.class);
    private final ApplicationDraftService applicationDraftService = mock(ApplicationDraftService.class);
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository = mock(ApplicationStatusHistoryRepository.class);
    private final ApplicationEvaluationRepository applicationEvaluationRepository = mock(ApplicationEvaluationRepository.class);
    private final InterviewAvailabilityRepository interviewAvailabilityRepository = mock(InterviewAvailabilityRepository.class);
    private final InterviewScheduleRepository interviewScheduleRepository = mock(InterviewScheduleRepository.class);
    private final InterviewRoundRepository interviewRoundRepository = mock(InterviewRoundRepository.class);
    private final InterviewSlotRepository interviewSlotRepository = mock(InterviewSlotRepository.class);
    private final InterviewRoundMemberRepositoryCustom interviewRoundMemberRepository = mock(InterviewRoundMemberRepositoryCustom.class);
    private final Clock clock = Clock.systemDefaultZone();

    private final GeneralApplicationService applicationService = new GeneralApplicationService(
            applicationRepository,
            recruitmentRepository,
            userRepository,
            clubMemberRepository,
            clubAuthService,
            clubMemberEnrollmentService,
            applicationDraftService,
            applicationStatusHistoryRepository,
            new ApplicationStatusChanger(applicationStatusHistoryRepository),
            applicationEvaluationRepository,
            interviewAvailabilityRepository,
            interviewScheduleRepository,
            interviewRoundRepository,
            interviewSlotRepository,
            interviewRoundMemberRepository,
            clock);

    @Test
    @DisplayName("내 지원 목록 조회 결과에 동아리 카테고리와 로고 URL이 포함된다")
    void myApplicationsSummaryIncludesCategoryAndLogoUrl() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(1L);
        when(club.getName()).thenReturn("스파크");
        when(club.getCategory()).thenReturn(ClubCategory.ACADEMIC);
        when(club.getLogoUrl()).thenReturn("https://example.com/logo.png");

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(2L);
        when(recruitment.getTitle()).thenReturn("2026 상반기 모집");
        when(recruitment.getClub()).thenReturn(club);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(10L);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 15, 9, 30));

        when(applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(99L, ApplicationScope.ALL.toStatuses()))
                .thenReturn(List.of(application));
        when(interviewScheduleRepository.findByApplicationIdIn(anyList()))
                .thenReturn(List.of());

        List<ApplicationSummaryQuery> summaries = applicationService.getMyApplications(99L, ApplicationScope.ALL.toStatuses());

        assertThat(summaries).hasSize(1);
        ApplicationSummaryQuery summary = summaries.get(0);
        assertThat(summary.category()).isEqualTo(ClubCategory.ACADEMIC);
        assertThat(summary.logoUrl()).isEqualTo("https://example.com/logo.png");
        assertThat(summary.clubName()).isEqualTo("스파크");
    }

    @Test
    @DisplayName("ASSIGNED schedule 이 있고 InterviewRound.location 이 null 인 경우에도 interview 가 노출되고 location 만 null 이다 (Codex review BE-3)")
    void interviewExposedInSummaryEvenWhenRoundLocationIsNull() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(1L);
        when(club.getName()).thenReturn("스파크");
        when(club.getCategory()).thenReturn(ClubCategory.ACADEMIC);
        when(club.getLogoUrl()).thenReturn(null);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(2L);
        when(recruitment.getTitle()).thenReturn("2026 상반기 모집");
        when(recruitment.getClub()).thenReturn(club);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(10L);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getStatus()).thenReturn(ApplicationStatus.INTERVIEW_PENDING);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 15, 9, 30));

        InterviewSchedule schedule = mock(InterviewSchedule.class);
        when(schedule.getStatus()).thenReturn(InterviewScheduleStatus.ASSIGNED);
        when(schedule.getApplicationId()).thenReturn(10L);
        when(schedule.getSlotId()).thenReturn(101L);
        when(schedule.getRoundId()).thenReturn(30L);

        InterviewSlot slot = mock(InterviewSlot.class);
        when(slot.getId()).thenReturn(101L);
        when(slot.getStartTime()).thenReturn(LocalDateTime.of(2026, 6, 20, 14, 0));
        when(slot.getEndTime()).thenReturn(LocalDateTime.of(2026, 6, 20, 14, 30));

        InterviewRound roundWithoutLocation = mock(InterviewRound.class);
        when(roundWithoutLocation.getId()).thenReturn(30L);
        when(roundWithoutLocation.getLocation()).thenReturn(null);

        when(applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(99L, ApplicationScope.ALL.toStatuses()))
                .thenReturn(List.of(application));
        when(interviewScheduleRepository.findByApplicationIdIn(anyList()))
                .thenReturn(List.of(schedule));
        when(interviewSlotRepository.findAllById(any())).thenReturn(List.of(slot));
        when(interviewRoundRepository.findAllById(any())).thenReturn(List.of(roundWithoutLocation));

        List<ApplicationSummaryQuery> summaries = applicationService.getMyApplications(99L, ApplicationScope.ALL.toStatuses());

        assertThat(summaries).hasSize(1);
        assertThat(summaries.get(0).interview()).isNotNull();
        assertThat(summaries.get(0).interview().startAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 14, 0));
        assertThat(summaries.get(0).interview().endAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 14, 30));
        assertThat(summaries.get(0).interview().location()).isNull();
    }

    @Test
    @DisplayName("로고 URL이 없는 동아리의 지원도 null 로 정상 반환된다")
    void myApplicationsSummaryWithNullLogoUrl() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(1L);
        when(club.getName()).thenReturn("그린어스");
        when(club.getCategory()).thenReturn(ClubCategory.VOLUNTEER);
        when(club.getLogoUrl()).thenReturn(null);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("봄 모집");
        when(recruitment.getClub()).thenReturn(club);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(20L);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getStatus()).thenReturn(ApplicationStatus.ON_HOLD);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 10, 14, 0));

        when(applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(99L, ApplicationScope.ALL.toStatuses()))
                .thenReturn(List.of(application));
        when(interviewScheduleRepository.findByApplicationIdIn(anyList()))
                .thenReturn(List.of());

        List<ApplicationSummaryQuery> summaries = applicationService.getMyApplications(99L, ApplicationScope.ALL.toStatuses());

        assertThat(summaries).hasSize(1);
        assertThat(summaries.get(0).logoUrl()).isNull();
        assertThat(summaries.get(0).category()).isEqualTo(ClubCategory.VOLUNTEER);
    }
}
