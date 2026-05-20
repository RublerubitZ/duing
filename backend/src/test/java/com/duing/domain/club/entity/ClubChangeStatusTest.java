package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubChangeStatusTest {

    @Test
    @DisplayName("PENDING → REJECTED 전이 시 reason 이 null 이면 RejectionReasonRequiredException 이 발생한다")
    void rejectedRequiresReasonNull() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        assertThatThrownBy(() -> club.changeStatus(ClubStatus.REJECTED, null, 1L))
                .isInstanceOf(ClubException.RejectionReasonRequiredException.class);
    }

    @Test
    @DisplayName("PENDING → REJECTED 전이 시 reason 이 공백만이면 예외가 발생한다")
    void rejectedRequiresReasonBlank() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        assertThatThrownBy(() -> club.changeStatus(ClubStatus.REJECTED, "   ", 1L))
                .isInstanceOf(ClubException.RejectionReasonRequiredException.class);
    }

    @Test
    @DisplayName("PENDING → REJECTED 정상 전이 시 status / rejectionReason / 감사 필드가 모두 갱신된다")
    void rejectedNormalTransition() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.REJECTED, " 활동 계획서 미흡 ", 7L);
        assertThat(club.getStatus()).isEqualTo(ClubStatus.REJECTED);
        assertThat(club.getRejectionReason()).isEqualTo("활동 계획서 미흡");
        assertThat(club.getStatusChangedBy()).isEqualTo(7L);
        assertThat(club.getStatusChangedAt()).isNotNull();
    }

    @Test
    @DisplayName("REJECTED → PENDING_APPROVAL 재심사 전이 시 기존 rejection_reason 이 null 로 초기화된다")
    void rejectedToPendingClearsReason() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.REJECTED, "이유", 1L);
        club.changeStatus(ClubStatus.PENDING_APPROVAL, null, 2L);
        assertThat(club.getStatus()).isEqualTo(ClubStatus.PENDING_APPROVAL);
        assertThat(club.getRejectionReason()).isNull();
    }

    @Test
    @DisplayName("허용되지 않는 전이 (PENDING → INACTIVE) 는 InvalidClubStatusTransitionException 이 발생한다")
    void invalidTransitionThrows() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        assertThatThrownBy(() -> club.changeStatus(ClubStatus.INACTIVE, null, 1L))
                .isInstanceOf(ClubException.InvalidClubStatusTransitionException.class);
    }
}
