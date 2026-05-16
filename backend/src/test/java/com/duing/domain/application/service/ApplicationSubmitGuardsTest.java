package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationSubmitGuardsTest {

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);

    private final GeneralApplicationService applicationService = new GeneralApplicationService(
            applicationRepository,
            recruitmentRepository,
            userRepository,
            clubMemberRepository,
            clubAuthService);

    @Test
    @DisplayName("외부 폼 모집에는 두잉 내에서 직접 지원할 수 없다")
    void submitToExternalFormRecruitmentIsRejected() {
        Recruitment externalRecruitment = mock(Recruitment.class);
        when(externalRecruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(externalRecruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);
        when(recruitmentRepository.findById(1L)).thenReturn(Optional.of(externalRecruitment));

        SubmitApplicationCommand submitCommand = new SubmitApplicationCommand(1L, 10L, List.of());

        assertThatThrownBy(() -> applicationService.submit(submitCommand))
                .isInstanceOf(ApplicationDomainException.ExternalFormSubmitException.class);
    }

    @Test
    @DisplayName("운영진 모집은 해당 동아리의 기존 부원만 지원할 수 있다")
    void officerRecruitmentRequiresExistingMembership() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(99L);

        Recruitment officerRecruitment = mock(Recruitment.class);
        when(officerRecruitment.getId()).thenReturn(1L);
        when(officerRecruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(officerRecruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);
        when(officerRecruitment.getTargetRole()).thenReturn(TargetRole.OFFICER);
        when(officerRecruitment.getClub()).thenReturn(club);

        User user = mock(User.class);
        when(user.getId()).thenReturn(10L);

        when(recruitmentRepository.findById(1L)).thenReturn(Optional.of(officerRecruitment));
        when(userRepository.findById(10L)).thenReturn(Optional.of(user));
        when(applicationRepository.existsByRecruitmentIdAndUserId(1L, 10L)).thenReturn(false);
        when(clubMemberRepository.existsByClubIdAndUserId(99L, 10L)).thenReturn(false);

        SubmitApplicationCommand submitCommand = new SubmitApplicationCommand(1L, 10L, List.of());

        assertThatThrownBy(() -> applicationService.submit(submitCommand))
                .isInstanceOf(ApplicationDomainException.OfficerMembershipRequiredException.class);
    }
}
