package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepositoryCustom;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationEligibilityCheckTest {

    private static final Long RECRUITMENT_ID = 1L;
    private static final Long USER_ID = 10L;
    private static final Long CLUB_ID = 99L;

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
    @DisplayName("존재하지 않는 모집의 지원 가능 여부 확인은 404 로 실패한다")
    void checkEligibilityFailsWhenRecruitmentNotFound() {
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.empty());

        assertThrows(RecruitmentException.RecruitmentNotFoundException.class,
                () -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    @Test
    @DisplayName("비공개 상태 동아리의 모집은 지원 가능 여부 확인에서 존재를 숨긴다(404)")
    void checkEligibilityFailsWhenClubIsNotActive() {
        Club inactiveClub = mock(Club.class);
        when(inactiveClub.getStatus()).thenReturn(ClubStatus.INACTIVE);
        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getClub()).thenReturn(inactiveClub);
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThrows(RecruitmentException.RecruitmentNotFoundException.class,
                () -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    @Test
    @DisplayName("마감된 모집은 지원 가능 여부 확인에서 차단된다")
    void checkEligibilityFailsWhenRecruitmentIsClosed() {
        Club activeClub = mock(Club.class);
        when(activeClub.getStatus()).thenReturn(ClubStatus.ACTIVE);
        // 실제 endDate 를 어제로 둔 OPEN 모집을 만들어 isEffectivelyOpen 의 실제 날짜 판정을 검증한다.
        Recruitment closedRecruitment = Recruitment.createWithOptions(
                activeClub,
                "테스트 모집",
                "테스트 내용",
                LocalDate.now().minusDays(10),
                LocalDate.now().minusDays(1),
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                null,
                null,
                false);
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(closedRecruitment));

        assertThrows(ApplicationDomainException.RecruitmentClosedException.class,
                () -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    @Test
    @DisplayName("외부 폼 모집은 지원 가능 여부 확인에서 차단된다")
    void checkEligibilityFailsWhenRecruitmentIsExternalForm() {
        Club activeClub = mock(Club.class);
        when(activeClub.getStatus()).thenReturn(ClubStatus.ACTIVE);
        Recruitment externalRecruitment = mock(Recruitment.class);
        when(externalRecruitment.getClub()).thenReturn(activeClub);
        when(externalRecruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(externalRecruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(externalRecruitment));

        assertThrows(ApplicationDomainException.ExternalFormSubmitException.class,
                () -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    @Test
    @DisplayName("존재하지 않는 사용자의 지원 가능 여부 확인은 404 로 실패한다")
    void checkEligibilityFailsWhenUserNotFound() {
        stubMemberRecruitment();
        when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

        assertThrows(UserException.UserNotFoundException.class,
                () -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    @Test
    @DisplayName("이미 지원한 모집은 지원 가능 여부 확인에서 409 로 차단된다")
    void checkEligibilityFailsWhenAlreadyApplied() {
        stubMemberRecruitment();
        User user = mock(User.class);
        when(user.getId()).thenReturn(USER_ID);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(applicationRepository.existsByRecruitmentIdAndUserId(RECRUITMENT_ID, USER_ID)).thenReturn(true);

        assertThrows(ApplicationDomainException.DuplicateApplicationException.class,
                () -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    @Test
    @DisplayName("이미 동아리 소속이면 일반 모집 지원 가능 여부 확인에서 409 로 차단된다")
    void checkEligibilityFailsWhenAlreadyClubMemberForMemberRecruitment() {
        stubMemberRecruitment();
        stubApplicantWithMembership(ClubMemberRole.MEMBER);

        assertThrows(ApplicationDomainException.AlreadyClubMemberException.class,
                () -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    @Test
    @DisplayName("운영진 모집은 비부원의 지원 가능 여부 확인을 403 으로 차단한다")
    void checkEligibilityFailsWhenNonMemberAppliesToOfficerRecruitment() {
        stubOfficerRecruitment();
        stubApplicantWithNoMembership();

        assertThrows(ApplicationDomainException.OfficerMembershipRequiredException.class,
                () -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID));
    }

    @Test
    @DisplayName("모든 조건을 통과하면 지원 가능 여부 확인은 예외 없이 끝난다")
    void checkEligibilityPassesWithoutSideEffectsWhenEligible() {
        stubMemberRecruitment();
        stubApplicantWithNoMembership();

        assertThatCode(() -> applicationService.checkEligibility(USER_ID, RECRUITMENT_ID))
                .doesNotThrowAnyException();

        // 사전 확인은 조회 전용이어야 한다 — 지원서가 실제로 저장되면 안 된다.
        verify(applicationRepository, never()).save(any(Application.class));
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
        // 비 ACTIVE 동아리 지원 차단 가드 통과용 — 이 테스트의 관심사는 멤버십/모드 가드다.
        when(club.getStatus()).thenReturn(ClubStatus.ACTIVE);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(RECRUITMENT_ID);
        when(recruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);
        when(recruitment.getTargetRole()).thenReturn(targetRole);
        when(recruitment.getClub()).thenReturn(club);

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
    }
}
