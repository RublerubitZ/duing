package com.duing.domain.application.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationStatusTest {

    @Test
    @DisplayName("SUBMITTED / UNDER_REVIEW / INTERVIEW_PENDING 는 active 상태로 분류된다")
    void activeStatuses() {
        assertThat(ApplicationStatus.SUBMITTED.isActive()).isTrue();
        assertThat(ApplicationStatus.UNDER_REVIEW.isActive()).isTrue();
        assertThat(ApplicationStatus.INTERVIEW_PENDING.isActive()).isTrue();
        assertThat(ApplicationStatus.SUBMITTED.isTerminal()).isFalse();
        assertThat(ApplicationStatus.UNDER_REVIEW.isTerminal()).isFalse();
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
}
