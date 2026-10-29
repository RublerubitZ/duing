package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubApprovalPendingSinceTest {

    @Test
    @DisplayName("반려 뒤 다시 승인 대기로 돌리면 승인 대기 시작은 마지막 상태 변경 시각이다")
    void repeatedPendingUsesStatusChangedAt() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.REJECTED, "활동 계획서 보완", 1L);
        club.changeStatus(ClubStatus.PENDING_APPROVAL, null, 2L);

        assertThat(club.approvalPendingSince()).isNotNull().isEqualTo(club.getStatusChangedAt());
    }

    @Test
    @DisplayName("승인된 동아리는 승인 대기 시작 시각이 없다")
    void activeClubHasNoPendingSince() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.ACTIVE, null, 1L);

        assertThat(club.approvalPendingSince()).isNull();
    }

    @Test
    @DisplayName("반려된 동아리는 승인 대기 시작 시각이 없다")
    void rejectedClubHasNoPendingSince() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.REJECTED, "활동 계획서 보완", 1L);

        assertThat(club.approvalPendingSince()).isNull();
    }

    @Test
    @DisplayName("운영 중단된 동아리는 승인 대기 시작 시각이 없다")
    void inactiveClubHasNoPendingSince() {
        Club club = Club.create("테스트", ClubCategory.ACADEMIC, "분과", "설명", null);
        club.changeStatus(ClubStatus.ACTIVE, null, 1L);
        club.changeStatus(ClubStatus.INACTIVE, null, 1L);

        assertThat(club.approvalPendingSince()).isNull();
    }
}
