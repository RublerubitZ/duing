package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationStatusTransitionTest {

    private Application newSubmittedApplication() {
        Club club = Club.create("두잉 동아리", ClubCategory.ACADEMIC, "공과대학", "설명", null);
        Recruitment recruitment = Recruitment.create(
                club,
                "2026 봄 모집",
                "내용",
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10);
        User user = User.create(
                "20251234",
                "홍길동",
                "hong@example.com",
                "hashed",
                UserRole.STUDENT);
        return Application.submit(recruitment, user, List.of());
    }

    @Test
    @DisplayName("면접 미사용: SUBMITTED → UNDER_REVIEW → ACCEPTED 흐름이 정상 처리된다")
    void transitionWithoutInterviewSucceeds() {
        Application application = newSubmittedApplication();

        application.transitionTo(ApplicationStatus.UNDER_REVIEW, false);
        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.UNDER_REVIEW);

        application.transitionTo(ApplicationStatus.ACCEPTED, false);
        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.ACCEPTED);
    }

    @Test
    @DisplayName("면접 미사용: SUBMITTED → UNDER_REVIEW → REJECTED 흐름이 정상 처리된다")
    void transitionWithoutInterviewToRejectedSucceeds() {
        Application application = newSubmittedApplication();

        application.transitionTo(ApplicationStatus.UNDER_REVIEW, false);
        application.transitionTo(ApplicationStatus.REJECTED, false);

        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.REJECTED);
    }

    @Test
    @DisplayName("면접 사용: UNDER_REVIEW 에서 곧바로 ACCEPTED 로 전이하면 예외가 발생한다")
    void underReviewToAcceptedBlockedWhenInterviewEnabled() {
        Application application = newSubmittedApplication();
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);

        assertThatThrownBy(() -> application.transitionTo(ApplicationStatus.ACCEPTED, true))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("면접 사용: UNDER_REVIEW → INTERVIEW_PENDING → ACCEPTED 흐름이 정상 처리된다")
    void interviewFlowSucceeds() {
        Application application = newSubmittedApplication();

        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.INTERVIEW_PENDING);

        application.transitionTo(ApplicationStatus.ACCEPTED, true);
        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.ACCEPTED);
    }

    @Test
    @DisplayName("종료 상태(ACCEPTED) 에서는 추가 전이가 차단된다")
    void acceptedIsTerminal() {
        Application application = newSubmittedApplication();
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, false);
        application.transitionTo(ApplicationStatus.ACCEPTED, false);

        assertThatThrownBy(() -> application.transitionTo(ApplicationStatus.REJECTED, false))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("종료 상태(REJECTED) 에서는 추가 전이가 차단된다")
    void rejectedIsTerminal() {
        Application application = newSubmittedApplication();
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, false);
        application.transitionTo(ApplicationStatus.REJECTED, false);

        assertThatThrownBy(() -> application.transitionTo(ApplicationStatus.ACCEPTED, false))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("SUBMITTED 에서 UNDER_REVIEW 외 상태로의 직접 전이는 차단된다")
    void submittedOnlyTransitionsToUnderReview() {
        Application application = newSubmittedApplication();

        assertThatThrownBy(() -> application.transitionTo(ApplicationStatus.ACCEPTED, false))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
        assertThatThrownBy(() -> application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("면접 일정 등록 시 일시가 비어 있으면 거절된다")
    void scheduleInterviewRequiresAt() {
        Application application = newSubmittedApplication();
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);

        assertThatThrownBy(() -> application.scheduleInterview(null, "본관 301호"))
                .isInstanceOf(ApplicationDomainException.InvalidInterviewScheduleException.class);
    }

    @Test
    @DisplayName("면접 일정 등록 시 장소가 비어 있으면 거절된다")
    void scheduleInterviewRequiresLocation() {
        Application application = newSubmittedApplication();
        application.transitionTo(ApplicationStatus.UNDER_REVIEW, true);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);

        assertThatThrownBy(() -> application.scheduleInterview(LocalDateTime.now().plusDays(1), "   "))
                .isInstanceOf(ApplicationDomainException.InvalidInterviewScheduleException.class);
    }
}
