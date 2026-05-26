package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecertificationRequestTest {

    private RecertificationRequest sample() {
        return RecertificationRequest.create(
                10L, 20L, 99L,
                "leader@example.com", "010-1234-5678",
                2026, "메모");
    }

    @Test
    @DisplayName("재인증 요청 생성 시 PENDING 이며 처리 정보가 비어 있다")
    void createInitializesPending() {
        RecertificationRequest request = sample();
        assertThat(request.getStatus()).isEqualTo(RecertificationStatus.PENDING);
        assertThat(request.getHandledBy()).isNull();
        assertThat(request.getHandledAt()).isNull();
    }

    @Test
    @DisplayName("APPROVED 처리 시 처리자/처리시각/메모가 저장된다")
    void processApproved() {
        RecertificationRequest request = sample();
        request.process(7L, RecertificationStatus.APPROVED, "확인");
        assertThat(request.getStatus()).isEqualTo(RecertificationStatus.APPROVED);
        assertThat(request.getHandledBy()).isEqualTo(7L);
        assertThat(request.getHandledAt()).isNotNull();
        assertThat(request.getActionNote()).isEqualTo("확인");
    }

    @Test
    @DisplayName("이미 종결된 요청을 다시 처리하면 예외가 발생한다")
    void processTwiceFails() {
        RecertificationRequest request = sample();
        request.process(7L, RecertificationStatus.REJECTED, null);
        assertThatThrownBy(() -> request.process(7L, RecertificationStatus.APPROVED, null))
                .isInstanceOf(ClubException.InvalidRecertificationTransitionException.class);
    }

    @Test
    @DisplayName("PENDING 으로 되돌리는 처리는 거절된다")
    void processToPendingFails() {
        RecertificationRequest request = sample();
        assertThatThrownBy(() -> request.process(7L, RecertificationStatus.PENDING, null))
                .isInstanceOf(ClubException.InvalidRecertificationTransitionException.class);
    }
}
