package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.application.service.dto.command.UpdateInterviewCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.notification.InterviewNotificationService;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;

class ApplicationInterviewServiceTest {

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final InterviewNotificationService interviewNotificationService = mock(InterviewNotificationService.class);
    private final ApplicationDraftService applicationDraftService = mock(ApplicationDraftService.class);
    private final ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository = mock(ApplicationStatusHistoryRepository.class);

    private final GeneralApplicationService applicationService = new GeneralApplicationService(
            applicationRepository,
            recruitmentRepository,
            userRepository,
            clubMemberRepository,
            clubAuthService,
            interviewNotificationService,
            applicationDraftService,
            eventPublisher,
            applicationStatusHistoryRepository);

    // ────────────────────────────────────────────────────────────
    // 공통 픽스처
    // ────────────────────────────────────────────────────────────

    private Application stubApplicationWithStatus(Long clubId, Long applicantId,
                                                   ApplicationStatus status, String applicantEmail) {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(clubId);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getClub()).thenReturn(club);

        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(applicantId);
        when(applicant.getEmail()).thenReturn(applicantEmail);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(applicantId * 10);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getUser()).thenReturn(applicant);
        when(application.getStatus()).thenReturn(status);

        return application;
    }

    // ────────────────────────────────────────────────────────────
    // 1. INTERVIEW_PENDING 상태에서 정상 입력 — 필드 반영 + 알림 호출
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("INTERVIEW_PENDING 상태의 지원서에 면접 일시·장소를 입력하면 도메인 메서드가 호출되고 알림이 발송된다")
    void updateInterviewOnPendingApplicationSucceeds() {
        Long applicationId = 1L;
        Long managerId = 10L;
        Long clubId = 5L;
        Long applicantId = 20L;
        LocalDateTime interviewAt = LocalDateTime.now().plusDays(3);
        String interviewLocation = "공학관 301호";
        String applicantEmail = "student@example.com";

        Application application = stubApplicationWithStatus(clubId, applicantId,
                ApplicationStatus.INTERVIEW_PENDING, applicantEmail);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        applicationService.updateInterview(
                new UpdateInterviewCommand(applicationId, managerId, interviewAt, interviewLocation));

        verify(application).updateInterview(interviewAt, interviewLocation);
        verify(interviewNotificationService).notifyInterviewScheduled(
                application.getId(), applicantEmail, interviewAt, interviewLocation);
        verify(clubAuthService).requireManager(managerId, clubId);
    }

    // ────────────────────────────────────────────────────────────
    // 2. UNDER_REVIEW 상태에서 입력 시도 → 409 InvalidInterviewStateException
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("UNDER_REVIEW 상태의 지원서에 면접 일정을 입력하면 InvalidInterviewStateException 이 발생한다")
    void updateInterviewOnUnderReviewApplicationThrowsInvalidStateException() {
        Long applicationId = 2L;
        Long managerId = 10L;
        Long clubId = 5L;
        LocalDateTime interviewAt = LocalDateTime.now().plusDays(3);

        Application application = stubApplicationWithStatus(clubId, 20L,
                ApplicationStatus.UNDER_REVIEW, "student@example.com");
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        doThrow(new ApplicationDomainException.InvalidInterviewStateException())
                .when(application).updateInterview(any(), any());

        assertThatThrownBy(() -> applicationService.updateInterview(
                new UpdateInterviewCommand(applicationId, managerId, interviewAt, "공학관 301호")))
                .isInstanceOf(ApplicationDomainException.InvalidInterviewStateException.class);

        verify(interviewNotificationService, never()).notifyInterviewScheduled(any(), any(), any(), any());
    }

    // ────────────────────────────────────────────────────────────
    // 3. SUBMITTED 상태에서 입력 시도 → 409 InvalidInterviewStateException
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("SUBMITTED 상태의 지원서에 면접 일정을 입력하면 InvalidInterviewStateException 이 발생한다")
    void updateInterviewOnSubmittedApplicationThrowsInvalidStateException() {
        Long applicationId = 3L;
        Long managerId = 10L;
        Long clubId = 5L;
        LocalDateTime interviewAt = LocalDateTime.now().plusDays(3);

        Application application = stubApplicationWithStatus(clubId, 20L,
                ApplicationStatus.SUBMITTED, "student@example.com");
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        doThrow(new ApplicationDomainException.InvalidInterviewStateException())
                .when(application).updateInterview(any(), any());

        assertThatThrownBy(() -> applicationService.updateInterview(
                new UpdateInterviewCommand(applicationId, managerId, interviewAt, "공학관 301호")))
                .isInstanceOf(ApplicationDomainException.InvalidInterviewStateException.class);

        verify(interviewNotificationService, never()).notifyInterviewScheduled(any(), any(), any(), any());
    }

    // ────────────────────────────────────────────────────────────
    // 4. 존재하지 않는 applicationId → 404 ApplicationNotFoundException
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("존재하지 않는 지원서 ID로 면접 일정 입력을 시도하면 ApplicationNotFoundException 이 발생한다")
    void updateInterviewWithMissingApplicationThrowsNotFoundException() {
        Long nonExistentApplicationId = 404L;
        when(applicationRepository.findById(nonExistentApplicationId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> applicationService.updateInterview(
                new UpdateInterviewCommand(nonExistentApplicationId, 10L,
                        LocalDateTime.now().plusDays(1), "공학관 301호")))
                .isInstanceOf(ApplicationDomainException.ApplicationNotFoundException.class);

        verify(interviewNotificationService, never()).notifyInterviewScheduled(any(), any(), any(), any());
    }

    // ────────────────────────────────────────────────────────────
    // 5. 동아리 MEMBER 가 시도 → 403 AccessDeniedException
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("동아리 운영진이 아닌 사용자가 면접 일정 입력을 시도하면 AccessDeniedException 이 발생한다")
    void updateInterviewByNonManagerThrowsAccessDeniedException() {
        Long applicationId = 5L;
        Long nonManagerUserId = 99L;
        Long clubId = 5L;

        Application application = stubApplicationWithStatus(clubId, 20L,
                ApplicationStatus.INTERVIEW_PENDING, "student@example.com");
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(nonManagerUserId, clubId);

        assertThatThrownBy(() -> applicationService.updateInterview(
                new UpdateInterviewCommand(applicationId, nonManagerUserId,
                        LocalDateTime.now().plusDays(1), "공학관 301호")))
                .isInstanceOf(AccessDeniedException.class);

        verify(application, never()).updateInterview(any(), any());
        verify(interviewNotificationService, never()).notifyInterviewScheduled(any(), any(), any(), any());
    }

    // ────────────────────────────────────────────────────────────
    // 6. 알림 서비스 예외가 발생해도 트랜잭션이 롤백되지 않고 정상 종료
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("알림 발송 중 예외가 발생해도 면접 일정 저장은 정상 완료되고 예외가 전파되지 않는다")
    void notificationFailureDoesNotRollbackInterviewUpdate() {
        Long applicationId = 6L;
        Long managerId = 10L;
        Long clubId = 5L;
        Long applicantId = 20L;
        LocalDateTime interviewAt = LocalDateTime.now().plusDays(2);
        String interviewLocation = "본관 201호";
        String applicantEmail = "student@example.com";

        Application application = stubApplicationWithStatus(clubId, applicantId,
                ApplicationStatus.INTERVIEW_PENDING, applicantEmail);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        doThrow(new RuntimeException("메일 서버 장애"))
                .when(interviewNotificationService).notifyInterviewScheduled(any(), any(), any(), any());

        // 예외가 전파되지 않아야 한다 (정상 종료)
        applicationService.updateInterview(
                new UpdateInterviewCommand(applicationId, managerId, interviewAt, interviewLocation));

        // 도메인 메서드는 호출되었어야 한다 (필드 저장 확인)
        verify(application).updateInterview(interviewAt, interviewLocation);
    }
}
