package com.duing.global.privacy;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 번호 열람 창(분 30/시 300)의 수치 배선·사용자 격리·거절 미기록을 잠근다.
 * 슬라이딩 윈도우 경계 자체는 {@code PhoneVerificationRateLimiterTest} 가 검증한다(JoinCodeRateLimiterTest 와 같은 분담).
 */
class PhoneRevealRateLimiterTest {

    private static final Long ACTOR_USER_ID = 7L;
    private static final Long OTHER_ACTOR_USER_ID = 8L;
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 9, 20, 14, 0);

    private final PhoneRevealRateLimiter rateLimiter = new PhoneRevealRateLimiter();

    @Test
    @DisplayName("같은 운영진의 번호 열람은 1분에 30회까지 허용하고 31번째는 429 를 던진다")
    void limitsRevealsPerMinute() {
        for (int attempt = 0; attempt < PhoneRevealRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusNanos(attempt));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusSeconds(30)))
                .isInstanceOf(PhoneRevealRateLimitedException.class);
    }

    @Test
    @DisplayName("같은 운영진의 번호 열람은 1시간에 300회를 넘을 수 없다")
    void limitsRevealsPerHour() {
        for (int attempt = 0; attempt < PhoneRevealRateLimiter.PER_HOUR_LIMIT; attempt++) {
            // 분당 한도(30)에 걸리지 않도록 3초 간격으로 분산한다 (300회 × 3초 = 15분, 분당 20회).
            rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusSeconds(attempt * 3L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusMinutes(20)))
                .isInstanceOf(PhoneRevealRateLimitedException.class);
    }

    @Test
    @DisplayName("창은 운영진별로 독립이다 — 한 사람이 한도를 채워도 다른 사람의 열람은 막히지 않는다")
    void windowsAreIsolatedPerUser() {
        for (int attempt = 0; attempt < PhoneRevealRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusNanos(attempt));
        }

        assertThatCode(() -> rateLimiter.assertAndRecord(OTHER_ACTOR_USER_ID, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("거절된 열람은 창에 기록되지 않는다 — 가장 오래된 한 칸이 빠지는 순간 바로 다시 허용된다")
    void rejectedRevealIsNotRecorded() {
        for (int attempt = 0; attempt < PhoneRevealRateLimiter.PER_HOUR_LIMIT; attempt++) {
            rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusSeconds(attempt * 3L));
        }
        assertThatThrownBy(() -> rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusMinutes(20)))
                .isInstanceOf(PhoneRevealRateLimitedException.class);

        // 첫 기록(NOW)만 1시간 창 밖으로 밀려난 시점 — 거절이 기록됐다면 그 빈자리를 차지해 여전히 거절된다.
        assertThatCode(() -> rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusHours(1).plusSeconds(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("reset 은 모든 운영진의 창을 초기화한다 (통합 테스트 격리용)")
    void resetClearsEveryWindow() {
        for (int attempt = 0; attempt < PhoneRevealRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusNanos(attempt));
        }
        rateLimiter.reset();

        assertThatCode(() -> rateLimiter.assertAndRecord(ACTOR_USER_ID, NOW.plusSeconds(1)))
                .doesNotThrowAnyException();
    }
}
