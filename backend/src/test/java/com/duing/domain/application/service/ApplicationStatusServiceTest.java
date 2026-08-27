package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
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
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.clubmember.service.ClubMemberEnrollmentService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.service.InterviewAssignmentQueryService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;

class ApplicationStatusServiceTest {

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final ClubMemberEnrollmentService clubMemberEnrollmentService = mock(ClubMemberEnrollmentService.class);
    private final ApplicationDraftService applicationDraftService = mock(ApplicationDraftService.class);
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository = mock(ApplicationStatusHistoryRepository.class);
    private final ApplicationEvaluationRepository applicationEvaluationRepository = mock(ApplicationEvaluationRepository.class);
    private final InterviewAssignmentQueryService interviewAssignmentQueryService =
            mock(InterviewAssignmentQueryService.class);
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
            interviewAssignmentQueryService,
            clock);

    // ────────────────────────────────────────────────────────────
    // 공통 픽스처 빌더
    // ────────────────────────────────────────────────────────────

    /**
     * 운영진 대상 모집 합격 게이트가 requireManager 의 반환값(수행자)으로 역할을 판정하므로,
     * 기본 반환값 null 을 그대로 두면 그 분기에 도달하는 테스트가 NPE 로 죽는다.
     * 기본 전제는 "회장이 아닌 일반 운영진" — 회장 전용 경로를 검증하는 테스트만 LEADER 로 덮어쓴다.
     */
    @BeforeEach
    void stubDefaultActorAsOfficer() {
        stubActorRole(ClubMemberRole.OFFICER);
    }

    private void stubActorRole(ClubMemberRole role) {
        ClubMember actor = mock(ClubMember.class);
        when(actor.getRole()).thenReturn(role);
        when(clubAuthService.requireManager(any(), any())).thenReturn(actor);
    }

    private Application stubApplication(Long clubId, Long applicantId, TargetRole targetRole) {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(clubId);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getTargetRole()).thenReturn(targetRole);
        when(recruitment.isUseInterview()).thenReturn(false);

        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(applicantId);

        Application application = mock(Application.class);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getUser()).thenReturn(applicant);

        return application;
    }

    // ────────────────────────────────────────────────────────────
    // 1. 상태 전이 스모크 (SUBMITTED → ON_HOLD)
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("운영진이 SUBMITTED 지원서를 ON_HOLD 로 변경하면 정상 처리된다")
    void submittedToOnHoldSucceeds() {
        Long applicationId = 1L;
        Long managerId = 10L;
        Long clubId = 5L;

        Application application = stubApplication(clubId, 20L, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(userRepository.findById(managerId)).thenReturn(Optional.of(mock(User.class)));

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.ON_HOLD));

        // 3번째 인자는 "마감 정리 전이인지" — 진행 중 모집이므로 false.
        verify(application).transitionTo(ApplicationStatus.ON_HOLD, false, false);
        verify(clubAuthService).requireManager(managerId, clubId);
    }

    // ────────────────────────────────────────────────────────────
    // 2. 멱등성 — ACCEPTED 상태에서 ACCEPTED 재호출 시 InvalidStatusTransitionException
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("이미 ACCEPTED 된 지원서에 ACCEPTED 를 다시 호출하면 InvalidStatusTransitionException 이 발생한다")
    void reAcceptingAlreadyAcceptedApplicationThrowsTransitionException() {
        Long applicationId = 2L;
        Long managerId = 10L;
        Long clubId = 5L;

        Application application = stubApplication(clubId, 20L, TargetRole.MEMBER);

        // transitionTo 가 ACCEPTED→ACCEPTED 를 차단함 (도메인 계층 책임)
        doThrow(new ApplicationDomainException.InvalidStatusTransitionException())
                .when(application).transitionTo(ApplicationStatus.ACCEPTED, false, false);

        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        assertThatThrownBy(() -> applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.ACCEPTED)))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);

        // 상태 전이가 차단되므로 userRepository 조회 및 회원 등록 위임은 발생하지 않아야 한다
        verify(userRepository, never()).findById(any());
        verify(clubMemberEnrollmentService, never()).enroll(any(), any(), any(), any());
    }

    // ────────────────────────────────────────────────────────────
    // 3~4. 합격 시 모집의 targetRole 이 그대로 회원 등록에 위임된다
    //      (신규 생성 / 승급 / 강등 금지 자체는 ClubMemberEnrollmentServiceTest 가 실 DB 로 검증한다)
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("회장이 처리한 OFFICER 모집 합격자는 OFFICER 역할로 동아리 회원 등록에 위임된다")
    void officerRecruitmentAcceptedByLeaderDelegatesOfficerEnrollment() {
        Long applicationId = 3L;
        Long leaderId = 10L;
        Long clubId = 5L;
        Long applicantId = 20L;

        // 운영진 대상 모집의 합격 처리는 회장 전용이므로 수행자를 회장으로 명시한다.
        stubActorRole(ClubMemberRole.LEADER);
        Application application = stubApplication(clubId, applicantId, TargetRole.OFFICER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(userRepository.findById(leaderId)).thenReturn(Optional.of(mock(User.class)));

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.ACCEPTED));

        // 지원 승인 경로는 기수를 부여하지 않으므로 generation 은 null 로 전달되어야 한다.
        verify(clubMemberEnrollmentService).enroll(
                application.getRecruitment().getClub(),
                application.getUser(),
                ClubMemberRole.OFFICER,
                null);
    }

    // ────────────────────────────────────────────────────────────
    // 3-1. 운영진 대상 모집의 합격 처리는 회장 전용 — 운영진이 모집을 경유해 스스로
    //      운영진을 늘리는 경로를 막는다. 직접 경로(updateRole)의 requireLeader 와 등급을 맞춘 것.
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("운영진 대상 모집의 합격 처리는 회장만 할 수 있다")
    void officerTargetAcceptanceIsRejectedForNonLeaderManager() {
        Long applicationId = 8L;
        Long officerId = 11L;
        Long clubId = 5L;

        stubActorRole(ClubMemberRole.OFFICER);
        Application application = stubApplication(clubId, 20L, TargetRole.OFFICER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        assertThatThrownBy(() -> applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, officerId, ApplicationStatus.ACCEPTED)))
                .isInstanceOf(RecruitmentException.OfficerTargetRequiresLeaderException.class);

        // 게이트는 상태 전이·이력 기록보다 먼저 걸려야 한다 — 흔적을 남기고 롤백되면 안 된다.
        verify(application, never()).transitionTo(any(), anyBoolean(), anyBoolean());
        verify(clubMemberEnrollmentService, never()).enroll(any(), any(), any(), any());
    }

    @Test
    @DisplayName("운영진이라도 부원 대상 모집의 합격 처리는 그대로 할 수 있다")
    void memberTargetAcceptanceRemainsOpenToOfficer() {
        Long applicationId = 9L;
        Long officerId = 11L;
        Long clubId = 5L;

        stubActorRole(ClubMemberRole.OFFICER);
        Application application = stubApplication(clubId, 20L, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(userRepository.findById(officerId)).thenReturn(Optional.of(mock(User.class)));

        assertThatCode(() -> applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, officerId, ApplicationStatus.ACCEPTED)))
                .doesNotThrowAnyException();

        verify(clubMemberEnrollmentService).enroll(
                application.getRecruitment().getClub(),
                application.getUser(),
                ClubMemberRole.MEMBER,
                null);
    }

    @Test
    @DisplayName("운영진 대상 모집이라도 불합격 처리는 운영진이 할 수 있다")
    void officerTargetRejectionRemainsOpenToOfficer() {
        Long applicationId = 10L;
        Long officerId = 11L;
        Long clubId = 5L;

        stubActorRole(ClubMemberRole.OFFICER);
        Application application = stubApplication(clubId, 20L, TargetRole.OFFICER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(userRepository.findById(officerId)).thenReturn(Optional.of(mock(User.class)));

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, officerId, ApplicationStatus.REJECTED));

        // 게이트는 ACCEPTED 에만 걸린다 — 나머지 전이는 club_members.role 을 건드리지 않는다.
        verify(application).transitionTo(ApplicationStatus.REJECTED, false, false);
        verify(clubMemberEnrollmentService, never()).enroll(any(), any(), any(), any());
    }

    @Test
    @DisplayName("MEMBER 모집 합격자는 MEMBER 역할로 동아리 회원 등록에 위임된다")
    void memberRecruitmentAcceptedDelegatesMemberEnrollment() {
        Long applicationId = 4L;
        Long managerId = 10L;
        Long clubId = 5L;
        Long applicantId = 20L;

        Application application = stubApplication(clubId, applicantId, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(userRepository.findById(managerId)).thenReturn(Optional.of(mock(User.class)));

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.ACCEPTED));

        verify(clubMemberEnrollmentService).enroll(
                application.getRecruitment().getClub(),
                application.getUser(),
                ClubMemberRole.MEMBER,
                null);
    }

    // ────────────────────────────────────────────────────────────
    // 5. 합격이 아닌 전이에서는 회원 등록 위임이 일어나지 않는다
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("합격이 아닌 상태로 변경하면 동아리 회원 등록이 호출되지 않는다")
    void nonAcceptedTransitionDoesNotEnrollMember() {
        Long applicationId = 5L;
        Long managerId = 10L;
        Long clubId = 5L;

        Application application = stubApplication(clubId, 20L, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(userRepository.findById(managerId)).thenReturn(Optional.of(mock(User.class)));

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.REJECTED));

        verify(clubMemberEnrollmentService, never()).enroll(any(), any(), any(), any());
    }

    // ────────────────────────────────────────────────────────────
    // 6. 권한 위반 — MEMBER 역할 사용자가 상태 변경 시도
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("동아리 운영진이 아닌 사용자가 지원서 상태 변경을 시도하면 AccessDeniedException 이 발생한다")
    void nonManagerCannotUpdateApplicationStatus() {
        Long applicationId = 6L;
        Long nonManagerUserId = 99L;
        Long clubId = 5L;

        Application application = stubApplication(clubId, 20L, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(nonManagerUserId, clubId);

        assertThatThrownBy(() -> applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, nonManagerUserId, ApplicationStatus.ON_HOLD)))
                .isInstanceOf(AccessDeniedException.class);

        // 권한 차단 후 상태 변경 로직이 실행되어서는 안 된다
        verify(application, never()).transitionTo(any(), any(boolean.class), any(boolean.class));
    }

    // ────────────────────────────────────────────────────────────
    // 7. OptimisticLock 충돌은 도메인 예외(ConcurrentStatusUpdateException) 로 변환된다
    //    — bulkUpdateStatus 의 ApplicationException 분기로 흘러가야 사용자 메시지가 정확히 응답된다.
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("flush 시점에 ObjectOptimisticLockingFailureException 이 발생하면 ConcurrentStatusUpdateException 으로 변환된다")
    void optimisticLockFailureIsConvertedToDomainException() {
        Long applicationId = 7L;
        Long managerId = 10L;
        Long clubId = 5L;

        Application application = stubApplication(clubId, 20L, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(userRepository.findById(managerId)).thenReturn(Optional.of(mock(User.class)));

        // 다른 트랜잭션이 먼저 status 를 변경한 상황을 모사한다.
        doThrow(new ObjectOptimisticLockingFailureException(Application.class, applicationId))
                .when(applicationRepository).flush();

        assertThatThrownBy(() -> applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.REJECTED)))
                .isInstanceOf(ApplicationDomainException.ConcurrentStatusUpdateException.class);

        // 권한 확인 및 도메인 전이는 충돌 검출 이전에 호출되었어야 한다
        verify(clubAuthService).requireManager(managerId, clubId);
        verify(application).transitionTo(ApplicationStatus.REJECTED, false, false);
    }
}
