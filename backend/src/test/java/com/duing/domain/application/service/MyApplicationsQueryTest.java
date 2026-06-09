package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.notification.InterviewNotificationService;
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
    private final InterviewNotificationService interviewNotificationService = mock(InterviewNotificationService.class);
    private final ApplicationDraftService applicationDraftService = mock(ApplicationDraftService.class);
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository = mock(ApplicationStatusHistoryRepository.class);
    private final ApplicationEvaluationRepository applicationEvaluationRepository = mock(ApplicationEvaluationRepository.class);
    private final com.duing.domain.interview.service.InterviewAvailabilityService interviewAvailabilityService = mock(com.duing.domain.interview.service.InterviewAvailabilityService.class);
    private final com.duing.domain.interview.repository.InterviewAvailabilityRepository interviewAvailabilityRepository = mock(com.duing.domain.interview.repository.InterviewAvailabilityRepository.class);
    private final com.duing.domain.interview.repository.InterviewScheduleRepository interviewScheduleRepository = mock(com.duing.domain.interview.repository.InterviewScheduleRepository.class);
    private final com.duing.domain.interview.repository.InterviewConfigRepository interviewConfigRepository = mock(com.duing.domain.interview.repository.InterviewConfigRepository.class);

    private final GeneralApplicationService applicationService = new GeneralApplicationService(
            applicationRepository,
            recruitmentRepository,
            userRepository,
            clubMemberRepository,
            clubAuthService,
            interviewNotificationService,
            applicationDraftService,
            applicationStatusHistoryRepository,
            applicationEvaluationRepository,
            interviewAvailabilityService,
            interviewAvailabilityRepository,
            interviewScheduleRepository,
            interviewConfigRepository);

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
        when(application.getInterviewAt()).thenReturn(null);
        when(application.getInterviewLocation()).thenReturn(null);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 15, 9, 30));

        when(applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(99L, ApplicationScope.ALL.toStatuses()))
                .thenReturn(List.of(application));

        List<ApplicationSummaryQuery> summaries = applicationService.getMyApplications(99L, ApplicationScope.ALL.toStatuses());

        assertThat(summaries).hasSize(1);
        ApplicationSummaryQuery summary = summaries.get(0);
        assertThat(summary.category()).isEqualTo(ClubCategory.ACADEMIC);
        assertThat(summary.logoUrl()).isEqualTo("https://example.com/logo.png");
        assertThat(summary.clubName()).isEqualTo("스파크");
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
        when(application.getStatus()).thenReturn(ApplicationStatus.UNDER_REVIEW);
        when(application.getInterviewAt()).thenReturn(null);
        when(application.getInterviewLocation()).thenReturn(null);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 10, 14, 0));

        when(applicationRepository.findByUserIdAndStatusInOrderByCreatedAtDesc(99L, ApplicationScope.ALL.toStatuses()))
                .thenReturn(List.of(application));

        List<ApplicationSummaryQuery> summaries = applicationService.getMyApplications(99L, ApplicationScope.ALL.toStatuses());

        assertThat(summaries).hasSize(1);
        assertThat(summaries.get(0).logoUrl()).isNull();
        assertThat(summaries.get(0).category()).isEqualTo(ClubCategory.VOLUNTEER);
    }
}
