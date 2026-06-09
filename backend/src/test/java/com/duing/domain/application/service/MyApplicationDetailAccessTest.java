package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.service.InterviewAvailabilityService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.notification.InterviewNotificationService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MyApplicationDetailAccessTest {

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final InterviewNotificationService interviewNotificationService = mock(InterviewNotificationService.class);
    private final ApplicationDraftService applicationDraftService = mock(ApplicationDraftService.class);
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository = mock(ApplicationStatusHistoryRepository.class);
    private final ApplicationEvaluationRepository applicationEvaluationRepository = mock(ApplicationEvaluationRepository.class);
    private final InterviewAvailabilityService interviewAvailabilityService = mock(InterviewAvailabilityService.class);
    private final InterviewAvailabilityRepository interviewAvailabilityRepository = mock(InterviewAvailabilityRepository.class);
    private final InterviewScheduleRepository interviewScheduleRepository = mock(InterviewScheduleRepository.class);
    private final InterviewConfigRepository interviewConfigRepository = mock(InterviewConfigRepository.class);

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
    @DisplayName("다른 사용자의 지원 상세를 조회하면 ForbiddenApplicationAccessException 이 발생한다")
    void othersApplicationDetailIsForbidden() {
        User owner = mock(User.class);
        when(owner.getId()).thenReturn(10L);

        Application application = mock(Application.class);
        when(application.getUser()).thenReturn(owner);

        when(applicationRepository.findById(1L)).thenReturn(Optional.of(application));

        assertThatThrownBy(() -> applicationService.getMyApplicationDetail(1L, 999L))
                .isInstanceOf(ApplicationDomainException.ForbiddenApplicationAccessException.class);
    }

    @Test
    @DisplayName("본인 지원 상세 조회는 질문·답변·면접 정보를 함께 반환한다")
    void ownerCanReadOwnApplicationDetail() {
        User owner = mock(User.class);
        when(owner.getId()).thenReturn(10L);

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(7L);
        when(club.getName()).thenReturn("동아리");

        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(List.of("Q1", "Q2"));

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("모집 공고");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getForm()).thenReturn(form);

        LocalDateTime interviewAt = LocalDateTime.of(2026, 5, 20, 14, 0);
        LocalDateTime submittedAt = LocalDateTime.of(2026, 5, 15, 9, 30);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(1L);
        when(application.getUser()).thenReturn(owner);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of("A1", "A2"));
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getInterviewAt()).thenReturn(interviewAt);
        when(application.getInterviewLocation()).thenReturn("본관 301호");
        when(application.getCreatedAt()).thenReturn(submittedAt);

        when(applicationRepository.findById(1L)).thenReturn(Optional.of(application));

        var detail = applicationService.getMyApplicationDetail(1L, 10L);

        assertThat(detail.id()).isEqualTo(1L);
        assertThat(detail.questions()).containsExactly("Q1", "Q2");
        assertThat(detail.answers()).containsExactly("A1", "A2");
        assertThat(detail.clubId()).isEqualTo(7L);
        assertThat(detail.recruitmentId()).isEqualTo(3L);
        assertThat(detail.interviewAt()).isEqualTo(interviewAt);
        assertThat(detail.interviewLocation()).isEqualTo("본관 301호");
        assertThat(detail.submittedAt()).isEqualTo(submittedAt);
    }

    @Test
    @DisplayName("존재하지 않는 지원 ID 로 조회하면 ApplicationNotFoundException 이 발생한다")
    void missingApplicationThrowsNotFound() {
        when(applicationRepository.findById(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> applicationService.getMyApplicationDetail(404L, 10L))
                .isInstanceOf(ApplicationDomainException.ApplicationNotFoundException.class);
    }

    @Test
    @DisplayName("면접 사용 모집의 본인 지원 상세는 가능시간 수·일정 배정 여부·마감 시각을 함께 반환한다")
    void interviewProgressionFieldsArePopulatedFromRepositoriesWhenUseInterview() {
        long applicationId = 1L;
        long currentUserId = 10L;
        long recruitmentId = 3L;
        LocalDateTime deadline = LocalDateTime.of(2026, 6, 15, 18, 0);

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, true);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(2L);
        when(interviewScheduleRepository.existsByApplicationId(applicationId)).thenReturn(false);

        InterviewConfig interviewConfig = mock(InterviewConfig.class);
        when(interviewConfig.getAvailabilityDeadline()).thenReturn(deadline);
        when(interviewConfigRepository.findByRecruitmentId(recruitmentId))
                .thenReturn(Optional.of(interviewConfig));

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.interviewAvailabilityCount()).isEqualTo(2);
        assertThat(detail.interviewScheduleAssigned()).isFalse();
        assertThat(detail.availabilityDeadline()).isEqualTo(deadline);
    }

    @Test
    @DisplayName("useInterview=false 모집은 InterviewConfig 조회 없이 availabilityDeadline 을 null 로 반환한다")
    void availabilityDeadlineIsNullWhenUseInterviewFalse() {
        long applicationId = 2L;
        long currentUserId = 10L;
        long recruitmentId = 4L;

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, false);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(0L);
        when(interviewScheduleRepository.existsByApplicationId(applicationId)).thenReturn(false);

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.availabilityDeadline()).isNull();
        // useInterview=false 면 config 조회 자체가 발생하지 않아야 한다.
        org.mockito.Mockito.verifyNoInteractions(interviewConfigRepository);
    }

    @Test
    @DisplayName("useInterview=true 이지만 InterviewConfig 가 없으면 availabilityDeadline 은 null 이다")
    void availabilityDeadlineIsNullWhenConfigMissing() {
        long applicationId = 3L;
        long currentUserId = 10L;
        long recruitmentId = 5L;

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, true);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(0L);
        when(interviewScheduleRepository.existsByApplicationId(applicationId)).thenReturn(false);
        when(interviewConfigRepository.findByRecruitmentId(recruitmentId)).thenReturn(Optional.empty());

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.availabilityDeadline()).isNull();
    }

    @Test
    @DisplayName("InterviewSchedule 이 존재하면 interviewScheduleAssigned 가 true 로 반환된다")
    void interviewScheduleAssignedReflectsExistence() {
        long applicationId = 4L;
        long currentUserId = 10L;
        long recruitmentId = 6L;

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, true);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(3L);
        when(interviewScheduleRepository.existsByApplicationId(applicationId)).thenReturn(true);
        when(interviewConfigRepository.findByRecruitmentId(recruitmentId)).thenReturn(Optional.empty());

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.interviewScheduleAssigned()).isTrue();
        assertThat(detail.interviewAvailabilityCount()).isEqualTo(3);
    }

    private Application stubOwnedApplication(long applicationId, long ownerId, long recruitmentId, boolean useInterview) {
        User owner = mock(User.class);
        when(owner.getId()).thenReturn(ownerId);

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(7L);
        when(club.getName()).thenReturn("동아리");

        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(List.of("Q1"));

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(recruitmentId);
        when(recruitment.getTitle()).thenReturn("모집 공고");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getForm()).thenReturn(form);
        when(recruitment.isUseInterview()).thenReturn(useInterview);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(applicationId);
        when(application.getUser()).thenReturn(owner);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of("A1"));
        when(application.getStatus()).thenReturn(ApplicationStatus.INTERVIEW_PENDING);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 15, 9, 30));
        return application;
    }
}
