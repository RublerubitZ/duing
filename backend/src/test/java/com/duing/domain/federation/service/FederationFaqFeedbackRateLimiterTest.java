package com.duing.domain.federation.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.federation.exception.FederationFaqException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 익명 FAQ 피드백 제출 IP 창의 경계값을 잠근다 — 인수 테스트는 HTTP 429 표면화만 보고,
 * 정확한 전환 지점(분 30/시 200)은 여기서 검증한다 ({@code JoinCodeRateLimiterTest} 와 같은 역할 분리).
 */
class FederationFaqFeedbackRateLimiterTest {

    private static final String CLIENT_IP = "10.0.0.1";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 3, 12, 0);

    private final FederationFaqFeedbackRateLimiter rateLimiter = new FederationFaqFeedbackRateLimiter();

    @Test
    @DisplayName("같은 IP 의 익명 피드백은 1분에 30회까지 허용하고 31번째는 429 를 던진다")
    void anonymousFeedbackLimitsPerMinute() {
        for (int attempt = 0; attempt < FederationFaqFeedbackRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordAnonymousFeedback(CLIENT_IP, NOW.plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordAnonymousFeedback(CLIENT_IP, NOW.plusSeconds(30)))
                .isInstanceOf(FederationFaqException.FaqFeedbackRateLimitedException.class);
    }

    @Test
    @DisplayName("같은 IP 의 익명 피드백은 1시간에 200회를 넘을 수 없다")
    void anonymousFeedbackLimitsPerHour() {
        for (int attempt = 0; attempt < FederationFaqFeedbackRateLimiter.PER_HOUR_LIMIT; attempt++) {
            // 분당 한도(30)에 걸리지 않도록 3초 간격으로 분산한다 (200회 × 3초 = 10분).
            rateLimiter.assertAndRecordAnonymousFeedback(CLIENT_IP, NOW.plusSeconds(attempt * 3L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordAnonymousFeedback(CLIENT_IP, NOW.plusMinutes(15)))
                .isInstanceOf(FederationFaqException.FaqFeedbackRateLimitedException.class);
    }

    @Test
    @DisplayName("서로 다른 IP 의 창은 독립이라 한쪽이 가득 차도 다른 쪽은 통과한다")
    void windowsAreIsolatedPerIp() {
        for (int attempt = 0; attempt < FederationFaqFeedbackRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordAnonymousFeedback(CLIENT_IP, NOW.plusNanos(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordAnonymousFeedback("10.0.0.2", NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("clientIp 를 얻지 못한 요청도 한 버킷으로 모여 한도가 적용된다")
    void missingClientIpSharesSingleBucket() {
        for (int attempt = 0; attempt < FederationFaqFeedbackRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordAnonymousFeedback(null, NOW.plusNanos(attempt));
        }
        // null 과 blank 는 같은 "unknown" 버킷 — 키 없음으로 창을 통째로 우회할 수 없어야 한다.
        assertThatThrownBy(() -> rateLimiter.assertAndRecordAnonymousFeedback("  ", NOW.plusSeconds(1)))
                .isInstanceOf(FederationFaqException.FaqFeedbackRateLimitedException.class);
    }

    @Test
    @DisplayName("reset 은 창을 초기화한다 (통합 테스트 격리용)")
    void resetClearsWindow() {
        for (int attempt = 0; attempt < FederationFaqFeedbackRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordAnonymousFeedback(CLIENT_IP, NOW.plusNanos(attempt));
        }
        rateLimiter.reset();

        assertThatCode(() -> rateLimiter.assertAndRecordAnonymousFeedback(CLIENT_IP, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }
}
