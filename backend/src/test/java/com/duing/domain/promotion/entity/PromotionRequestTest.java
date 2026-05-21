package com.duing.domain.promotion.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.promotion.exception.PromotionException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PromotionRequestTest {

    private PromotionRequest sample() {
        return PromotionRequest.create(
                10L, 99L,
                "타이틀", "설명",
                "/files/banner.png", "https://example.com");
    }

    @Test
    @DisplayName("홍보 요청 생성 시 PENDING 이며 처리 정보가 비어 있다")
    void createInitializesPending() {
        PromotionRequest request = sample();
        assertThat(request.getStatus()).isEqualTo(PromotionRequestStatus.PENDING);
        assertThat(request.getHandledBy()).isNull();
        assertThat(request.getHandledAt()).isNull();
    }

    @Test
    @DisplayName("ACCEPTED 처리 시 처리자/처리시각/메모가 저장된다")
    void processAccepted() {
        PromotionRequest request = sample();
        request.process(7L, PromotionRequestStatus.ACCEPTED, "확인");
        assertThat(request.getStatus()).isEqualTo(PromotionRequestStatus.ACCEPTED);
        assertThat(request.getHandledBy()).isEqualTo(7L);
        assertThat(request.getHandledAt()).isNotNull();
        assertThat(request.getActionNote()).isEqualTo("확인");
    }

    @Test
    @DisplayName("이미 종결된 요청을 다시 처리하면 예외가 발생한다")
    void processTwiceFails() {
        PromotionRequest request = sample();
        request.process(7L, PromotionRequestStatus.REJECTED, null);
        assertThatThrownBy(() -> request.process(7L, PromotionRequestStatus.ACCEPTED, null))
                .isInstanceOf(PromotionException.InvalidPromotionRequestTransitionException.class);
    }

    @Test
    @DisplayName("PENDING 으로 되돌리는 처리는 거절된다")
    void processToPendingFails() {
        PromotionRequest request = sample();
        assertThatThrownBy(() -> request.process(7L, PromotionRequestStatus.PENDING, null))
                .isInstanceOf(PromotionException.InvalidPromotionRequestTransitionException.class);
    }
}
