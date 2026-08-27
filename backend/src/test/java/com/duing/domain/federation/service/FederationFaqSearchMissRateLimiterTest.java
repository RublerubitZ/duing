package com.duing.domain.federation.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 무결과 검색어 기록 IP 창의 경계값과 "예외를 던지지 않는다"는 계약을 잠근다.
 * RestAssured 인수 테스트는 IP 를 바꿀 수 없으므로 IP 격리 축은 여기서만 검증 가능하다.
 */
class FederationFaqSearchMissRateLimiterTest {

    private static final String CLIENT_IP = "10.0.0.1";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 3, 12, 0);

    private final FederationFaqSearchMissRateLimiter rateLimiter = new FederationFaqSearchMissRateLimiter();

    @Test
    @DisplayName("같은 IP 의 무결과 기록은 1분에 10회까지 허용하고 11번째는 예외 없이 false 를 반환한다")
    void searchMissRecordingLimitsPerMinute() {
        for (int attempt = 0; attempt < FederationFaqSearchMissRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            assertThat(rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusNanos(attempt))).isTrue();
        }
        // 429 를 던지면 공개 FAQ 검색 자체가 죽는다 — 초과분은 기록만 건너뛴다.
        assertThat(rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusSeconds(30))).isFalse();
    }

    @Test
    @DisplayName("같은 IP 의 무결과 기록은 1시간에 60회를 넘을 수 없다")
    void searchMissRecordingLimitsPerHour() {
        for (int attempt = 0; attempt < FederationFaqSearchMissRateLimiter.PER_HOUR_LIMIT; attempt++) {
            // 분당 한도(10)에 걸리지 않도록 7초 간격으로 분산한다 (60회 × 7초 = 7분).
            assertThat(rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusSeconds(attempt * 7L))).isTrue();
        }
        assertThat(rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusMinutes(10))).isFalse();
    }

    @Test
    @DisplayName("레이트리밋 창은 IP 별로 독립이다")
    void windowsAreIsolatedPerIp() {
        for (int attempt = 0; attempt < FederationFaqSearchMissRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusNanos(attempt));
        }
        assertThat(rateLimiter.allowAndRecord("10.0.0.2", NOW.plusSeconds(1))).isTrue();
    }

    @Test
    @DisplayName("clientIp 를 얻지 못한 요청도 한 버킷으로 모여 한도가 적용된다")
    void missingClientIpSharesSingleBucket() {
        for (int attempt = 0; attempt < FederationFaqSearchMissRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            assertThat(rateLimiter.allowAndRecord(null, NOW.plusNanos(attempt))).isTrue();
        }
        // null 과 blank 는 같은 "unknown" 버킷 — 키 없음으로 창을 통째로 우회할 수 없어야 한다.
        assertThat(rateLimiter.allowAndRecord("  ", NOW.plusSeconds(1))).isFalse();
    }

    @Test
    @DisplayName("거절된 요청은 창에 기록되지 않아 창이 비면 곧바로 다시 허용된다")
    void rejectedRecordsAreNotCounted() {
        for (int attempt = 0; attempt < FederationFaqSearchMissRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusNanos(attempt));
        }
        // 한도 초과 시도를 여러 번 해도 창에 쌓이지 않으므로(메모리 고갈 방지),
        // 분 창이 지나면 시간 한도를 소모하지 않은 채 다시 허용된다.
        for (int rejected = 0; rejected < 50; rejected++) {
            assertThat(rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusSeconds(30))).isFalse();
        }
        assertThat(rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusMinutes(2))).isTrue();
    }

    @Test
    @DisplayName("reset 은 창을 초기화한다 (통합 테스트 격리용)")
    void resetClearsWindow() {
        for (int attempt = 0; attempt < FederationFaqSearchMissRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusNanos(attempt));
        }
        rateLimiter.reset();

        assertThat(rateLimiter.allowAndRecord(CLIENT_IP, NOW.plusSeconds(1))).isTrue();
    }
}
