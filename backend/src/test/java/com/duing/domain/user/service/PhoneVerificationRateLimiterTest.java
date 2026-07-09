package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PhoneVerificationRateLimiterTest {

    private static final String CLIENT_IP = "10.0.0.1";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 10, 12, 0);

    private final PhoneVerificationRateLimiter rateLimiter = new PhoneVerificationRateLimiter();

    @Test
    @DisplayName("같은 IP 의 발급 요청은 1분에 10회까지 허용하고 11번째는 429 를 던진다")
    void issueWindowLimitsPerMinute() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("1분 창을 벗어난 발급 기록은 분당 한도에서 제외된다 (시간당 한도 내라면 허용)")
    void issueMinuteWindowSlides() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusMinutes(2)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("같은 IP 의 발급 요청은 1시간에 60회를 넘을 수 없다")
    void issueWindowLimitsPerHour() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_HOUR_LIMIT; attempt++) {
            // 분당 한도(10)에 걸리지 않도록 7초 간격으로 넓게 분산한다 (60회 × 7초 = 7분).
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt * 7L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusMinutes(10)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("상태조회 창(분 30/시 200)은 발급 창과 독립이다")
    void statusWindowIsIndependent() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        // 발급 창이 가득 차도 상태조회는 별도 창으로 허용된다.
        assertThatCode(() -> rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .doesNotThrowAnyException();

        for (int attempt = 1; attempt < PhoneVerificationRateLimiter.STATUS_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(30).plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordStatusIpRequest(CLIENT_IP, NOW.plusSeconds(31)))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);
    }

    @Test
    @DisplayName("정확히 1분이 지난 시점의 요청은 가장 오래된 기록이 윈도우 밖으로 빠져 허용된다")
    void issueWindowBoundaryIsExclusive() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        // 윈도우는 exclusive — NOW+60초 시점엔 가장 오래된 NOW+0초 기록이 윈도우 밖이라 한도 미만이 되어 허용
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(60)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("다른 IP 는 발급 제한에 서로 영향을 주지 않는다")
    void issueLimitsAreIsolatedPerIp() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest("10.0.0.2", NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("reset 은 모든 창을 초기화한다 (통합 테스트 격리용)")
    void resetClearsWindows() {
        for (int attempt = 0; attempt < PhoneVerificationRateLimiter.ISSUE_PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(attempt));
        }
        rateLimiter.reset();
        assertThatCode(() -> rateLimiter.assertAndRecordIssueIpRequest(CLIENT_IP, NOW.plusSeconds(30)))
                .doesNotThrowAnyException();
    }
}
