package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepositoryCustom;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
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
            applicationDraftService,
            applicationStatusHistoryRepository,
            applicationEvaluationRepository,
            interviewAvailabilityRepository,
            interviewScheduleRepository,
            interviewRoundRepository,
            interviewSlotRepository,
            interviewRoundMemberRepository,
            clock);

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
    @DisplayName("본인 지원 상세 조회는 질문·답변을 함께 반환하고 면접 미배정 시 interview 는 null 이다")
    void ownerCanReadOwnApplicationDetailWithoutAssignedInterview() {
        Application application = stubOwnedApplication(1L, 10L, 3L, false);
        // useInterview=false 이므로 INTERVIEW_PENDING 가 아닌 SUBMITTED 로 가정한다.
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getAnswers()).thenReturn(List.of("A1", "A2"));

        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(List.of("Q1", "Q2"));
        when(application.getRecruitment().getForm()).thenReturn(form);

        LocalDateTime submittedAt = LocalDateTime.of(2026, 5, 15, 9, 30);
        when(application.getCreatedAt()).thenReturn(submittedAt);

        when(applicationRepository.findById(1L)).thenReturn(Optional.of(application));

        var detail = applicationService.getMyApplicationDetail(1L, 10L);

        assertThat(detail.id()).isEqualTo(1L);
        assertThat(detail.questions()).containsExactly("Q1", "Q2");
        assertThat(detail.answers()).containsExactly("A1", "A2");
        assertThat(detail.clubId()).isEqualTo(7L);
        assertThat(detail.recruitmentId()).isEqualTo(3L);
        assertThat(detail.interview()).isNull();
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
    @DisplayName("면접 사용 모집의 본인 지원 상세는 가능시간 수·마감 시각·interview 를 함께 반환한다")
    void interviewProgressionFieldsArePopulatedFromRepositoriesWhenUseInterview() {
        long applicationId = 1L;
        long currentUserId = 10L;
        long recruitmentId = 3L;
        LocalDateTime deadline = LocalDateTime.of(2026, 6, 15, 18, 0);

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, true);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(2L);
        // ASSIGNED schedule 이 없으면 interview = null
        when(interviewScheduleRepository.findByApplicationId(applicationId))
                .thenReturn(Optional.empty());

        InterviewRound collectingRound = InterviewRoundFixture.withStatus(
                recruitmentId, deadline, "3호관 201호", RoundStatus.COLLECTING);
        when(interviewRoundRepository.findVisibleToApplicantRoundByApplicationId(applicationId))
                .thenReturn(Optional.of(collectingRound));

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.interviewAvailabilityCount()).isEqualTo(2);
        assertThat(detail.interview()).isNull();
        assertThat(detail.availabilityDeadline()).isEqualTo(deadline);
    }

    @Test
    @DisplayName("useInterview=false 모집은 면접 레포지토리를 호출하지 않고 면접 진행 필드를 기본값으로 반환한다")
    void availabilityDeadlineIsNullWhenUseInterviewFalse() {
        long applicationId = 2L;
        long currentUserId = 10L;
        long recruitmentId = 4L;

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, false);
        // useInterview=false 모집은 INTERVIEW_PENDING 으로 진입 불가능하므로 status 를 SUBMITTED 로 덮어 쓴다.
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.interviewAvailabilityCount()).isZero();
        assertThat(detail.interview()).isNull();
        assertThat(detail.availabilityDeadline()).isNull();
        // useInterview=false 면 면접 관련 레포지토리 호출 자체가 발생하지 않아야 한다.
        verify(interviewAvailabilityRepository, never()).countByApplicationId(applicationId);
        verifyNoInteractions(interviewScheduleRepository);
        verifyNoInteractions(interviewRoundRepository);
        verifyNoInteractions(interviewSlotRepository);
    }

    @Test
    @DisplayName("useInterview=true 이지만 지원자에게 보이는 라운드가 없으면 availabilityDeadline 과 interview 가 모두 null 이다")
    void availabilityDeadlineIsNullWhenVisibleRoundMissing() {
        long applicationId = 3L;
        long currentUserId = 10L;
        long recruitmentId = 5L;

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, true);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(0L);
        when(interviewRoundRepository.findVisibleToApplicantRoundByApplicationId(applicationId))
                .thenReturn(Optional.empty());

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.availabilityDeadline()).isNull();
        assertThat(detail.interview()).isNull();
    }

    @Test
    @DisplayName("ASSIGNED InterviewSchedule + InterviewRound.location 이 있으면 interview = { startAt, endAt, location } 으로 채워진다")
    void assignedInterviewPopulatesInterview() {
        long applicationId = 4L;
        long currentUserId = 10L;
        long recruitmentId = 6L;
        long slotId = 100L;
        long roundId = 30L;
        LocalDateTime startAt = LocalDateTime.of(2026, 6, 20, 18, 0);
        LocalDateTime endAt = LocalDateTime.of(2026, 6, 20, 18, 30);

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, true);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(3L);

        InterviewRound scheduledRound = InterviewRoundFixture.withStatus(
                recruitmentId, LocalDateTime.of(2026, 6, 15, 18, 0), "3호관 201호", RoundStatus.SCHEDULED);
        when(interviewRoundRepository.findById(roundId)).thenReturn(Optional.of(scheduledRound));

        InterviewSchedule schedule = mock(InterviewSchedule.class);
        when(schedule.getStatus()).thenReturn(InterviewScheduleStatus.ASSIGNED);
        when(schedule.getSlotId()).thenReturn(slotId);
        when(schedule.getRoundId()).thenReturn(roundId);
        when(interviewScheduleRepository.findByApplicationId(applicationId))
                .thenReturn(Optional.of(schedule));

        InterviewSlot slot = mock(InterviewSlot.class);
        when(slot.getStartTime()).thenReturn(startAt);
        when(slot.getEndTime()).thenReturn(endAt);
        when(interviewSlotRepository.findById(slotId)).thenReturn(Optional.of(slot));

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.interview()).isNotNull();
        assertThat(detail.interview().startAt()).isEqualTo(startAt);
        assertThat(detail.interview().endAt()).isEqualTo(endAt);
        assertThat(detail.interview().location()).isEqualTo("3호관 201호");
        assertThat(detail.interviewAvailabilityCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("InterviewSchedule 이 CANCELLED 상태만 존재하면 interview 는 null 로 반환된다")
    void cancelledScheduleResultsInNullInterview() {
        long applicationId = 5L;
        long currentUserId = 10L;
        long recruitmentId = 7L;

        Application application = stubOwnedApplication(applicationId, currentUserId, recruitmentId, true);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(1L);

        InterviewSchedule cancelled = mock(InterviewSchedule.class);
        when(cancelled.getStatus()).thenReturn(InterviewScheduleStatus.CANCELLED);
        when(interviewScheduleRepository.findByApplicationId(applicationId))
                .thenReturn(Optional.of(cancelled));

        var detail = applicationService.getMyApplicationDetail(applicationId, currentUserId);

        assertThat(detail.interview()).isNull();
        assertThat(detail.interviewAvailabilityCount()).isEqualTo(1);
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
