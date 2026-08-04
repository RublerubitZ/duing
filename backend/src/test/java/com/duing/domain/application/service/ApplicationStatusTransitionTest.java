package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 지원 상태 전이표(설계 스펙 §1-2) 전수 검증.
 * <p>
 * 허용 전이만 목록으로 명시하고, 나머지 조합(from × to × useInterview 전체)은 자동으로 생성해
 * 차단을 확인한다 — 전이표에 없는 경로가 새로 열리면 반드시 실패한다.
 */
class ApplicationStatusTransitionTest {

    static Stream<Arguments> allowedTransitions() {
        return Stream.of(
                // 비면접 모집: 서류 검토 단계 없이 곧바로 합격·불합격·보류로 간다.
                Arguments.of(ApplicationStatus.SUBMITTED, ApplicationStatus.ACCEPTED, false),
                Arguments.of(ApplicationStatus.SUBMITTED, ApplicationStatus.REJECTED, false),
                Arguments.of(ApplicationStatus.SUBMITTED, ApplicationStatus.ON_HOLD, false),
                Arguments.of(ApplicationStatus.ON_HOLD, ApplicationStatus.ACCEPTED, false),
                Arguments.of(ApplicationStatus.ON_HOLD, ApplicationStatus.REJECTED, false),
                // 면접 모집: 합격은 반드시 면접 대상(INTERVIEW_PENDING) 을 경유한다.
                Arguments.of(ApplicationStatus.SUBMITTED, ApplicationStatus.INTERVIEW_PENDING, true),
                Arguments.of(ApplicationStatus.SUBMITTED, ApplicationStatus.REJECTED, true),
                Arguments.of(ApplicationStatus.SUBMITTED, ApplicationStatus.ON_HOLD, true),
                Arguments.of(ApplicationStatus.ON_HOLD, ApplicationStatus.INTERVIEW_PENDING, true),
                Arguments.of(ApplicationStatus.ON_HOLD, ApplicationStatus.REJECTED, true),
                // 면접 대상의 결과 처리는 면접 사용 여부와 무관하게 동일하다.
                Arguments.of(ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.ACCEPTED, false),
                Arguments.of(ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.REJECTED, false),
                Arguments.of(ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.ACCEPTED, true),
                Arguments.of(ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.REJECTED, true));
    }

    static Stream<Arguments> blockedTransitions() {
        Set<List<Object>> allowed = allowedTransitions()
                .map(transition -> List.of(transition.get()))
                .collect(Collectors.toSet());
        return Stream.of(ApplicationStatus.values())
                .flatMap(from -> Stream.of(ApplicationStatus.values())
                        .flatMap(to -> Stream.of(false, true)
                                .map(useInterview -> Arguments.of(from, to, useInterview))))
                .filter(transition -> !allowed.contains(List.of(transition.get())));
    }

    @ParameterizedTest(name = "{0} → {1} (면접 사용 = {2})")
    @MethodSource("allowedTransitions")
    @DisplayName("전이표에 정의된 전이는 허용되고 상태가 목표 값으로 갱신된다")
    void allowedTransitionsChangeStatus(ApplicationStatus from, ApplicationStatus to, boolean useInterview) {
        Application application = applicationWithStatus(from);

        application.transitionTo(to, useInterview);

        assertThat(application.getStatus()).isEqualTo(to);
    }

    @ParameterizedTest(name = "{0} → {1} (면접 사용 = {2})")
    @MethodSource("blockedTransitions")
    @DisplayName("전이표에 없는 조합은 모두 차단되고 상태가 그대로 유지된다")
    void blockedTransitionsAreRejected(ApplicationStatus from, ApplicationStatus to, boolean useInterview) {
        Application application = applicationWithStatus(from);

        assertThatThrownBy(() -> application.transitionTo(to, useInterview))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
        assertThat(application.getStatus()).isEqualTo(from);
    }

    @Test
    @DisplayName("면접을 사용하는 모집에서는 보류 상태에서 합격으로 바로 전이할 수 없다")
    void onHoldCannotGoStraightToAcceptedWhenInterviewEnabled() {
        Application application = applicationWithStatus(ApplicationStatus.ON_HOLD);

        assertThatThrownBy(() -> application.transitionTo(ApplicationStatus.ACCEPTED, true))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("서류심사(UNDER_REVIEW) 는 어떤 상태로도 나갈 수 없고 어떤 상태에서도 들어올 수 없다")
    void underReviewIsADeadStatus() {
        for (ApplicationStatus otherStatus : ApplicationStatus.values()) {
            for (boolean useInterview : new boolean[]{false, true}) {
                Application leaving = applicationWithStatus(ApplicationStatus.UNDER_REVIEW);
                assertThatThrownBy(() -> leaving.transitionTo(otherStatus, useInterview))
                        .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);

                Application entering = applicationWithStatus(otherStatus);
                assertThatThrownBy(() -> entering.transitionTo(ApplicationStatus.UNDER_REVIEW, useInterview))
                        .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
            }
        }
    }

    private Application applicationWithStatus(ApplicationStatus status) {
        Club club = Club.create("두잉 동아리", ClubCategory.ACADEMIC, "공과대학", "설명", null);
        Recruitment recruitment = Recruitment.create(
                club,
                "2026 봄 모집",
                "내용",
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10);
        User applicant = User.create(
                "20251234",
                "홍길동",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now());
        Application application = Application.submit(recruitment, applicant, List.of());
        if (status != ApplicationStatus.SUBMITTED) {
            // 전이 규칙 자체가 검증 대상이므로 시작 상태는 전이를 우회해 세팅한다
            // (UNDER_REVIEW 는 새 전이표로는 도달할 수 없는 죽은 상태라 리플렉션 외 방법이 없다).
            ReflectionTestUtils.setField(application, "status", status);
        }
        return application;
    }
}
