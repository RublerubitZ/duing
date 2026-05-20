package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubStatusTransitionTest {

    @Test
    @DisplayName("PENDING_APPROVAL 에서 ACTIVE 와 REJECTED 로만 전이할 수 있다")
    void pendingApprovalAllowedTransitions() {
        assertThat(ClubStatus.PENDING_APPROVAL.canTransitionTo(ClubStatus.ACTIVE)).isTrue();
        assertThat(ClubStatus.PENDING_APPROVAL.canTransitionTo(ClubStatus.REJECTED)).isTrue();
        assertThat(ClubStatus.PENDING_APPROVAL.canTransitionTo(ClubStatus.INACTIVE)).isFalse();
        assertThat(ClubStatus.PENDING_APPROVAL.canTransitionTo(ClubStatus.PENDING_APPROVAL)).isFalse();
    }

    @Test
    @DisplayName("ACTIVE 는 INACTIVE 로만 전이할 수 있다")
    void activeAllowedTransitions() {
        assertThat(ClubStatus.ACTIVE.canTransitionTo(ClubStatus.INACTIVE)).isTrue();
        assertThat(ClubStatus.ACTIVE.canTransitionTo(ClubStatus.PENDING_APPROVAL)).isFalse();
        assertThat(ClubStatus.ACTIVE.canTransitionTo(ClubStatus.REJECTED)).isFalse();
        assertThat(ClubStatus.ACTIVE.canTransitionTo(ClubStatus.ACTIVE)).isFalse();
    }

    @Test
    @DisplayName("INACTIVE 는 ACTIVE 로만 전이할 수 있다")
    void inactiveAllowedTransitions() {
        assertThat(ClubStatus.INACTIVE.canTransitionTo(ClubStatus.ACTIVE)).isTrue();
        assertThat(ClubStatus.INACTIVE.canTransitionTo(ClubStatus.PENDING_APPROVAL)).isFalse();
        assertThat(ClubStatus.INACTIVE.canTransitionTo(ClubStatus.REJECTED)).isFalse();
        assertThat(ClubStatus.INACTIVE.canTransitionTo(ClubStatus.INACTIVE)).isFalse();
    }

    @Test
    @DisplayName("REJECTED 는 PENDING_APPROVAL 로만 재심사 가능하다")
    void rejectedAllowedTransitions() {
        assertThat(ClubStatus.REJECTED.canTransitionTo(ClubStatus.PENDING_APPROVAL)).isTrue();
        assertThat(ClubStatus.REJECTED.canTransitionTo(ClubStatus.ACTIVE)).isFalse();
        assertThat(ClubStatus.REJECTED.canTransitionTo(ClubStatus.INACTIVE)).isFalse();
        assertThat(ClubStatus.REJECTED.canTransitionTo(ClubStatus.REJECTED)).isFalse();
    }
}
