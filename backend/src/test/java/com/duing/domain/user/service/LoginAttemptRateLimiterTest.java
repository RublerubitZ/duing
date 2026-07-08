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
    @DisplayName("같은 IP 의 분당 실패 한도까지는 허용하고 그 다음 검사는 429로 차단한다")
    void blocksOverPerMinuteFailureLimit() {
        for (int attempt = 0; attempt < LoginAttemptRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.recordFailure(IP, NOW);
        }
        assertThatThrownBy(() -> rateLimiter.assertWithinLimit(IP, NOW))
                .isInstanceOf(UserException.TooManyLoginAttemptsException.class);
    }

    @Test
    @DisplayName("실패를 기록하지 않고 검사만 반복하면(성공 로그인 상당) 아무리 많아도 차단되지 않는다")
    void checkOnlyNeverAccumulatesSoSuccessfulLoginsAreNotBlocked() {
        for (int attempt = 0; attempt < LoginAttemptRateLimiter.PER_HOUR_LIMIT * 2; attempt++) {
            assertThatCode(() -> rateLimiter.assertWithinLimit(IP, NOW))
                    .doesNotThrowAnyException();
        }
    }

    @Test
    @DisplayName("1분이 지나면 이전 실패는 분당 윈도우에서 빠져 다시 허용된다")
    void slidesAfterAMinute() {
        for (int attempt = 0; attempt < LoginAttemptRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.recordFailure(IP, NOW);
        }
        assertThatCode(() -> rateLimiter.assertWithinLimit(IP, NOW.plusSeconds(61)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("분당 한도에 걸리지 않을 만큼 벌려 기록해도 시간당 실패 누적이 한도에 닿으면 429로 차단된다")
    void blocksOverPerHourFailureLimit() {
        // 각 실패를 10초 간격으로 벌린다 — 어느 1분 창에도 최대 6건뿐이라 분당 한도(10)에는 절대 안 걸리지만,
        // 1시간 안에 100건이 누적된다(100건 × 10초 = 1000초 < 3600초). 따라서 이 테스트는 분당 로직이 아니라
        // 시간당 size 조건(failureTimes.size() >= PER_HOUR_LIMIT)만으로 차단되는지를 단독으로 검증한다.
        long spacingSeconds = 10L;
        for (int attempt = 0; attempt < LoginAttemptRateLimiter.PER_HOUR_LIMIT; attempt++) {
            rateLimiter.recordFailure(IP, NOW.plusSeconds(attempt * spacingSeconds));
        }
        LocalDateTime checkTime = NOW.plusSeconds(spacingSeconds * (LoginAttemptRateLimiter.PER_HOUR_LIMIT - 1));
        assertThatThrownBy(() -> rateLimiter.assertWithinLimit(IP, checkTime))
                .isInstanceOf(UserException.TooManyLoginAttemptsException.class);
    }

    @Test
    @DisplayName("clientIp 가 비어 있으면(획득 불가) 검사·기록 모두 제한을 적용하지 않는다")
    void skipsWhenIpMissing() {
        for (int attempt = 0; attempt < LoginAttemptRateLimiter.PER_MINUTE_LIMIT + 5; attempt++) {
            rateLimiter.recordFailure(null, NOW);
            rateLimiter.recordFailure("  ", NOW);
        }
        assertThatCode(() -> rateLimiter.assertWithinLimit(null, NOW)).doesNotThrowAnyException();
        assertThatCode(() -> rateLimiter.assertWithinLimit("  ", NOW)).doesNotThrowAnyException();
    }
}
