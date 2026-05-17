package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.notification.InterviewNotificationService;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;

class ApplicationStatusServiceTest {

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final InterviewNotificationService interviewNotificationService = mock(InterviewNotificationService.class);
    private final ApplicationDraftService applicationDraftService = mock(ApplicationDraftService.class);
    private final ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);

    private final GeneralApplicationService applicationService = new GeneralApplicationService(
            applicationRepository,
            recruitmentRepository,
            userRepository,
            clubMemberRepository,
            clubAuthService,
            interviewNotificationService,
            applicationDraftService,
            eventPublisher);

    // ────────────────────────────────────────────────────────────
    // 공통 픽스처 빌더
    // ────────────────────────────────────────────────────────────

    private Application stubUnderReviewApplication(Long clubId, Long applicantId, TargetRole targetRole) {
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
    // 1. 상태 전이 스모크 (SUBMITTED → UNDER_REVIEW)
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("운영진이 SUBMITTED 지원서를 UNDER_REVIEW 로 변경하면 정상 처리된다")
    void submittedToUnderReviewSucceeds() {
        Long applicationId = 1L;
        Long managerId = 10L;
        Long clubId = 5L;

        Application application = stubUnderReviewApplication(clubId, 20L, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.UNDER_REVIEW));

        verify(application).transitionTo(ApplicationStatus.UNDER_REVIEW, false);
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

        Application application = stubUnderReviewApplication(clubId, 20L, TargetRole.MEMBER);

        // transitionTo 가 ACCEPTED→ACCEPTED 를 차단함 (도메인 계층 책임)
        doThrow(new ApplicationDomainException.InvalidStatusTransitionException())
                .when(application).transitionTo(ApplicationStatus.ACCEPTED, false);

        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        assertThatThrownBy(() -> applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.ACCEPTED)))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);

        // 상태 전이가 차단되므로 ClubMember 행 조작은 발생하지 않아야 한다
        verify(clubMemberRepository, never()).findByClubIdAndUserId(any(), any());
        verify(clubMemberRepository, never()).save(any());
    }

    // ────────────────────────────────────────────────────────────
    // 3. OFFICER 모집 합격 시 기존 멤버십 없는 사용자 → role=OFFICER 로 신규 생성
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("OFFICER 모집 합격자에게 기존 멤버십이 없으면 role=OFFICER 로 ClubMember 가 새로 생성된다")
    void officerRecruitmentAcceptedCreatesOfficerMembership() {
        Long applicationId = 3L;
        Long managerId = 10L;
        Long clubId = 5L;
        Long applicantId = 20L;

        Application application = stubUnderReviewApplication(clubId, applicantId, TargetRole.OFFICER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));
        when(clubMemberRepository.findByClubIdAndUserId(clubId, applicantId))
                .thenReturn(Optional.empty());

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.ACCEPTED));

        ArgumentCaptor<ClubMember> captor = ArgumentCaptor.forClass(ClubMember.class);
        verify(clubMemberRepository).save(captor.capture());
        assertThat(captor.getValue().getRole()).isEqualTo(ClubMemberRole.OFFICER);
    }

    // ────────────────────────────────────────────────────────────
    // 4. OFFICER 모집 합격 시 기존 MEMBER → OFFICER 승급
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("OFFICER 모집 합격자가 이미 MEMBER 이면 같은 행의 role 이 OFFICER 로 변경되고 새 행은 생성되지 않는다")
    void officerRecruitmentAcceptedUpgradesMemberToOfficer() {
        Long applicationId = 4L;
        Long managerId = 10L;
        Long clubId = 5L;
        Long applicantId = 20L;

        Application application = stubUnderReviewApplication(clubId, applicantId, TargetRole.OFFICER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        ClubMember existingMembership = mock(ClubMember.class);
        when(existingMembership.getRole()).thenReturn(ClubMemberRole.MEMBER);
        when(clubMemberRepository.findByClubIdAndUserId(clubId, applicantId))
                .thenReturn(Optional.of(existingMembership));

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.ACCEPTED));

        verify(existingMembership).changeRole(ClubMemberRole.OFFICER);
        verify(clubMemberRepository, never()).save(any());
    }

    // ────────────────────────────────────────────────────────────
    // 5. MEMBER 모집 합격 시 기존 OFFICER 강등 금지
    // ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("MEMBER 모집 합격자가 이미 OFFICER 이면 강등하지 않고 역할을 그대로 유지한다")
    void memberRecruitmentAcceptedDoesNotDemoteOfficer() {
        Long applicationId = 5L;
        Long managerId = 10L;
        Long clubId = 5L;
        Long applicantId = 20L;

        Application application = stubUnderReviewApplication(clubId, applicantId, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        ClubMember existingMembership = mock(ClubMember.class);
        when(existingMembership.getRole()).thenReturn(ClubMemberRole.OFFICER);
        when(clubMemberRepository.findByClubIdAndUserId(clubId, applicantId))
                .thenReturn(Optional.of(existingMembership));

        applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, managerId, ApplicationStatus.ACCEPTED));

        // changeRole 이 호출되어서는 안 된다 (강등 금지)
        verify(existingMembership, never()).changeRole(any());
        verify(clubMemberRepository, never()).save(any());
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

        Application application = stubUnderReviewApplication(clubId, 20L, TargetRole.MEMBER);
        when(applicationRepository.findById(applicationId)).thenReturn(Optional.of(application));

        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(nonManagerUserId, clubId);

        assertThatThrownBy(() -> applicationService.updateStatus(
                new UpdateApplicationStatusCommand(applicationId, nonManagerUserId, ApplicationStatus.UNDER_REVIEW)))
                .isInstanceOf(AccessDeniedException.class);

        // 권한 차단 후 상태 변경 로직이 실행되어서는 안 된다
        verify(application, never()).transitionTo(any(), any(boolean.class));
    }
}
