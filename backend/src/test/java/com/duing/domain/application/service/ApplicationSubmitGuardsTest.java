package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.interview.service.InterviewAvailabilityService;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.notification.InterviewNotificationService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationSubmitGuardsTest {

    private static final Long RECRUITMENT_ID = 1L;
    private static final Long USER_ID = 10L;
    private static final Long CLUB_ID = 99L;

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
            interviewAvailabilityService);

    @Test
    @DisplayName("외부 폼 모집에는 두잉 내에서 직접 지원할 수 없다")
    void submitToExternalFormRecruitmentIsRejected() {
        Recruitment externalRecruitment = mock(Recruitment.class);
        when(externalRecruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(externalRecruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(externalRecruitment));

        SubmitApplicationCommand submitCommand = new SubmitApplicationCommand(RECRUITMENT_ID, USER_ID, List.of(), List.of());

        assertThatThrownBy(() -> applicationService.submit(submitCommand))
                .isInstanceOf(ApplicationDomainException.ExternalFormSubmitException.class);
    }

    @Test
    @DisplayName("MEMBER 모집은 멤버십이 없는 사용자만 지원할 수 있다")
    void memberRecruitmentAllowsUserWithoutMembership() {
        stubMemberRecruitment();
        stubApplicantWithNoMembership();

        assertThatCode(() -> applicationService.submit(submitCommand()))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 동아리 MEMBER 는 MEMBER 모집에 재지원할 수 없다")
    void memberRecruitmentRejectsExistingMember() {
        stubMemberRecruitment();
        stubApplicantWithMembership(ClubMemberRole.MEMBER);

        assertThatThrownBy(() -> applicationService.submit(submitCommand()))
                .isInstanceOf(ApplicationDomainException.AlreadyClubMemberException.class);
    }

    @Test
    @DisplayName("같은 동아리 OFFICER 는 MEMBER 모집에 재지원할 수 없다")
    void memberRecruitmentRejectsExistingOfficer() {
        stubMemberRecruitment();
        stubApplicantWithMembership(ClubMemberRole.OFFICER);

        assertThatThrownBy(() -> applicationService.submit(submitCommand()))
                .isInstanceOf(ApplicationDomainException.AlreadyClubMemberException.class);
    }

    @Test
    @DisplayName("같은 동아리 LEADER 는 MEMBER 모집에 재지원할 수 없다")
    void memberRecruitmentRejectsExistingLeader() {
        stubMemberRecruitment();
        stubApplicantWithMembership(ClubMemberRole.LEADER);

        assertThatThrownBy(() -> applicationService.submit(submitCommand()))
                .isInstanceOf(ApplicationDomainException.AlreadyClubMemberException.class);
    }

    @Test
    @DisplayName("운영진 모집은 해당 동아리의 기존 MEMBER 가 지원할 수 있다")
    void officerRecruitmentAllowsExistingMember() {
        stubOfficerRecruitment();
        stubApplicantWithMembership(ClubMemberRole.MEMBER);

        assertThatCode(() -> applicationService.submit(submitCommand()))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("운영진 모집은 해당 동아리의 기존 부원만 지원할 수 있다")
    void officerRecruitmentRequiresExistingMembership() {
        stubOfficerRecruitment();
        stubApplicantWithNoMembership();

        assertThatThrownBy(() -> applicationService.submit(submitCommand()))
                .isInstanceOf(ApplicationDomainException.OfficerMembershipRequiredException.class);
    }

    @Test
    @DisplayName("이미 OFFICER 인 사용자는 운영진 모집에 재지원할 수 없다")
    void officerRecruitmentRejectsExistingOfficer() {
        stubOfficerRecruitment();
        stubApplicantWithMembership(ClubMemberRole.OFFICER);

        assertThatThrownBy(() -> applicationService.submit(submitCommand()))
                .isInstanceOf(ApplicationDomainException.IneligibleOfficerApplicantException.class);
    }

    @Test
    @DisplayName("LEADER 는 운영진 모집에 재지원할 수 없다")
    void officerRecruitmentRejectsLeader() {
        stubOfficerRecruitment();
        stubApplicantWithMembership(ClubMemberRole.LEADER);

        assertThatThrownBy(() -> applicationService.submit(submitCommand()))
                .isInstanceOf(ApplicationDomainException.IneligibleOfficerApplicantException.class);
    }

    @Test
    @DisplayName("다른 동아리에 소속된 사용자는 MEMBER 모집에 지원할 수 있다")
    void memberRecruitmentAllowsApplicantFromOtherClub() {
        stubMemberRecruitment();
        // 다른 동아리 멤버십은 현재 모집의 club 조회 결과에 영향을 주지 않으므로 멤버십 없음과 동일하게 본다.
        stubApplicantWithNoMembership();

        assertThatCode(() -> applicationService.submit(submitCommand()))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("다른 동아리에 소속된 사용자는 운영진 모집에 차단된다")
    void officerRecruitmentRejectsApplicantFromOtherClub() {
        stubOfficerRecruitment();
        // 다른 동아리 멤버십만 있는 사용자는 현재 동아리 기준으로 멤버십 없음과 동일하다.
        stubApplicantWithNoMembership();

        assertThatThrownBy(() -> applicationService.submit(submitCommand()))
                .isInstanceOf(ApplicationDomainException.OfficerMembershipRequiredException.class);
    }

    private SubmitApplicationCommand submitCommand() {
        return new SubmitApplicationCommand(RECRUITMENT_ID, USER_ID, List.of(), List.of());
    }

    private void stubMemberRecruitment() {
        stubRecruitment(TargetRole.MEMBER);
    }

    private void stubOfficerRecruitment() {
        stubRecruitment(TargetRole.OFFICER);
    }

    private void stubRecruitment(TargetRole targetRole) {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(CLUB_ID);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(RECRUITMENT_ID);
        when(recruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);
        when(recruitment.getTargetRole()).thenReturn(targetRole);
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getForm()).thenReturn((RecruitmentForm) null);

        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
    }

    private void stubApplicantWithNoMembership() {
        stubApplicant();
        when(clubMemberRepository.findByClubIdAndUserId(CLUB_ID, USER_ID)).thenReturn(Optional.empty());
    }

    private void stubApplicantWithMembership(ClubMemberRole role) {
        stubApplicant();
        ClubMember membership = mock(ClubMember.class);
        when(membership.getRole()).thenReturn(role);
        when(clubMemberRepository.findByClubIdAndUserId(CLUB_ID, USER_ID)).thenReturn(Optional.of(membership));
    }

    private void stubApplicant() {
        User user = mock(User.class);
        when(user.getId()).thenReturn(USER_ID);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(applicationRepository.existsByRecruitmentIdAndUserId(RECRUITMENT_ID, USER_ID)).thenReturn(false);
        // 성공 케이스에서 save() 호출 시 NPE 가 나지 않도록 id 가 채워진 application 을 돌려준다.
        Application savedApplication = mock(Application.class);
        when(savedApplication.getId()).thenReturn(100L);
        when(applicationRepository.save(any(Application.class))).thenReturn(savedApplication);
    }
}
