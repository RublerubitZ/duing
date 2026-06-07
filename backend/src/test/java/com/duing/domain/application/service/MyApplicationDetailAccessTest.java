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
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
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
import org.springframework.context.ApplicationEventPublisher;

class MyApplicationDetailAccessTest {

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
}
