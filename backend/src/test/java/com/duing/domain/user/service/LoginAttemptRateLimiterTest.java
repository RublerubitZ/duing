package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.UserException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LoginAttemptRateLimiterTest {

    private static final String IP = "203.0.113.7";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 1, 12, 0, 0);

    private final LoginAttemptRateLimiter rateLimiter = new LoginAttemptRateLimiter();

    @BeforeEach
    void setUp() {
        rateLimiter.reset();
    }

    @Test
    @DisplayName("같은 IP 의 분당 한도까지는 허용하고 그 다음 시도는 429로 차단한다")
    void blocksOverPerMinuteLimit() {
        for (int attempt = 0; attempt < LoginAttemptRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordAttempt(IP, NOW);
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecordAttempt(IP, NOW))
                .isInstanceOf(UserException.TooManyLoginAttemptsException.class);
    }

    @Test
    @DisplayName("1분이 지나면 이전 시도는 분당 윈도우에서 빠져 다시 허용된다")
    void slidesAfterAMinute() {
        for (int attempt = 0; attempt < LoginAttemptRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecordAttempt(IP, NOW);
        }
        assertThatCode(() -> rateLimiter.assertAndRecordAttempt(IP, NOW.plusSeconds(61)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("clientIp 가 비어 있으면(획득 불가) 제한을 적용하지 않는다")
    void skipsWhenIpMissing() {
        for (int attempt = 0; attempt < LoginAttemptRateLimiter.PER_MINUTE_LIMIT + 5; attempt++) {
            assertThatCode(() -> rateLimiter.assertAndRecordAttempt(null, NOW))
                    .doesNotThrowAnyException();
            assertThatCode(() -> rateLimiter.assertAndRecordAttempt("  ", NOW))
                    .doesNotThrowAnyException();
        }
    }
}
