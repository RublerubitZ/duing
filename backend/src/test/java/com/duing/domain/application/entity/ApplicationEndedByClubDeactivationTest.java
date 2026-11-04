package com.duing.domain.application.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationEndedByClubDeactivationTest {

    @Test
    @DisplayName("새 지원서에는 운영 중단 표시가 없다")
    void newApplicationIsNotEndedByClubDeactivation() {
        assertThat(Application.submit(null, null, List.of()).isEndedByClubDeactivation()).isFalse();
    }

    @Test
    @DisplayName("불합격으로 바꾼 지원서에 운영 중단 표시를 남긴다")
    void marksRejectedApplication() {
        Application application = Application.submit(null, null, List.of());
        application.transitionTo(ApplicationStatus.REJECTED, false);

        application.markEndedByClubDeactivation();

        assertThat(application.isEndedByClubDeactivation()).isTrue();
    }

    @Test
    @DisplayName("불합격이 아닌 지원서에 운영 중단 표시를 남기려 하면 순서 실수로 보고 예외를 던지며 표시는 그대로다")
    void rejectsMarkingApplicationThatIsNotRejected() {
        Application submitted = Application.submit(null, null, List.of());
        Application accepted = Application.submit(null, null, List.of());
        accepted.transitionTo(ApplicationStatus.ACCEPTED, false);

        assertThatThrownBy(submitted::markEndedByClubDeactivation).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(accepted::markEndedByClubDeactivation).isInstanceOf(IllegalStateException.class);
        assertThat(submitted.isEndedByClubDeactivation()).isFalse();
        assertThat(accepted.isEndedByClubDeactivation()).isFalse();
    }
}
