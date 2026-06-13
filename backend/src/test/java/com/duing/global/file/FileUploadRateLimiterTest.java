package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.global.file.exception.FileException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FileUploadRateLimiterTest {

    private static final Long USER_ID = 42L;
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 1, 12, 0, 0);

    private final FileUploadRateLimiter rateLimiter = new FileUploadRateLimiter();

    @BeforeEach
    void setUp() {
        rateLimiter.reset();
    }

    @Test
    @DisplayName("같은 사용자의 분당 한도까지는 허용하고 초과 시 429 로 차단한다")
    void blocksOverPerMinuteLimit() {
        for (int attempt = 0; attempt < FileUploadRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertWithinLimit(USER_ID, NOW);
        }
        assertThatThrownBy(() -> rateLimiter.assertWithinLimit(USER_ID, NOW))
                .isInstanceOf(FileException.UploadRateLimitedException.class);
    }

    @Test
    @DisplayName("한 사용자가 한도에 도달해도 다른 사용자는 영향받지 않는다")
    void perUserIsolation() {
        for (int attempt = 0; attempt < FileUploadRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertWithinLimit(USER_ID, NOW);
        }
        assertThatCode(() -> rateLimiter.assertWithinLimit(99L, NOW)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("1분이 지나면 이전 업로드는 분당 윈도우에서 빠져 다시 허용된다")
    void slidesAfterAMinute() {
        for (int attempt = 0; attempt < FileUploadRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.assertWithinLimit(USER_ID, NOW);
        }
        assertThatCode(() -> rateLimiter.assertWithinLimit(USER_ID, NOW.plusSeconds(61)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("userId 가 null 이면 제한을 적용하지 않는다")
    void skipsWhenUserIdNull() {
        for (int attempt = 0; attempt < FileUploadRateLimiter.PER_MINUTE_LIMIT + 5; attempt++) {
            assertThatCode(() -> rateLimiter.assertWithinLimit(null, NOW)).doesNotThrowAnyException();
        }
    }

    @Test
    @DisplayName("분당 한도를 피해 시간당 한도까지 채우면 그 다음 업로드는 429 로 차단된다")
    void blocksOverPerHourLimit() {
        // 3초 간격 → 분당 20건(30 미만)으로 분당 한도는 건드리지 않으면서 시간당 한도(200)를 채운다.
        for (int attempt = 0; attempt < FileUploadRateLimiter.PER_HOUR_LIMIT; attempt++) {
            rateLimiter.assertWithinLimit(USER_ID, NOW.plusSeconds(attempt * 3L));
        }
        assertThatThrownBy(() -> rateLimiter.assertWithinLimit(
                USER_ID, NOW.plusSeconds((long) FileUploadRateLimiter.PER_HOUR_LIMIT * 3L)))
                .isInstanceOf(FileException.UploadRateLimitedException.class);
    }
}
