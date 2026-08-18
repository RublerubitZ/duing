package com.duing.domain.application.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationStatusTest {

    @Test
    @DisplayName("SUBMITTED / ON_HOLD / INTERVIEW_PENDING 는 active 상태로 분류된다")
    void activeStatuses() {
        assertThat(ApplicationStatus.SUBMITTED.isActive()).isTrue();
        assertThat(ApplicationStatus.ON_HOLD.isActive()).isTrue();
        assertThat(ApplicationStatus.INTERVIEW_PENDING.isActive()).isTrue();
        assertThat(ApplicationStatus.SUBMITTED.isTerminal()).isFalse();
        assertThat(ApplicationStatus.ON_HOLD.isTerminal()).isFalse();
        assertThat(ApplicationStatus.INTERVIEW_PENDING.isTerminal()).isFalse();
    }

    @Test
    @DisplayName("ACCEPTED / REJECTED 는 terminal 상태로 분류된다")
    void terminalStatuses() {
        assertThat(ApplicationStatus.ACCEPTED.isTerminal()).isTrue();
        assertThat(ApplicationStatus.REJECTED.isTerminal()).isTrue();
        assertThat(ApplicationStatus.ACCEPTED.isActive()).isFalse();
        assertThat(ApplicationStatus.REJECTED.isActive()).isFalse();
    }

    @Test
    @DisplayName("activeSet 은 isActive 술어의 파생이라 종결 상태를 제외한 전 상태를 담는다")
    void activeSetDerivesFromPredicate() {
        assertThat(ApplicationStatus.activeSet())
                .containsExactlyInAnyOrder(
                        ApplicationStatus.SUBMITTED, ApplicationStatus.ON_HOLD, ApplicationStatus.INTERVIEW_PENDING);
    }
}
