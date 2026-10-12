package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.UserException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StepUpAttemptRateLimiterTest {

    private static final Long USER_ID = 1L;
    private static final Long OTHER_USER_ID = 2L;
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 1, 12, 0);

    private final StepUpAttemptRateLimiter rateLimiter = new StepUpAttemptRateLimiter();

    @BeforeEach
    void setUp() {
        rateLimiter.reset();
    }

    @Test
    @DisplayName("분당 다섯 번까지는 기록되고 여섯 번째는 429 다")
    void recordFailureOrThrowCapsAtPerMinuteLimit() {
        for (int attempt = 0; attempt < StepUpAttemptRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.recordFailureOrThrow(USER_ID, NOW);
        }
        assertThatThrownBy(() -> rateLimiter.recordFailureOrThrow(USER_ID, NOW))
                .isInstanceOf(UserException.TooManyStepUpAttemptsException.class);
        // 검사 전용 경로도 동일하게 429.
        assertThatThrownBy(() -> rateLimiter.assertWithinLimit(USER_ID, NOW))
                .isInstanceOf(UserException.TooManyStepUpAttemptsException.class);
    }

    @Test
    @DisplayName("분당 한도에 걸려도 1분이 지나면 다시 기록된다")
    void slidesAfterAMinute() {
        for (int attempt = 0; attempt < StepUpAttemptRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.recordFailureOrThrow(USER_ID, NOW);
        }
        assertThatThrownBy(() -> rateLimiter.recordFailureOrThrow(USER_ID, NOW))
                .isInstanceOf(UserException.TooManyStepUpAttemptsException.class);

        assertThatCode(() -> rateLimiter.assertWithinLimit(USER_ID, NOW.plusSeconds(61)))
                .doesNotThrowAnyException();
        assertThatCode(() -> rateLimiter.recordFailureOrThrow(USER_ID, NOW.plusSeconds(61)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("시간당 스무 번을 넘기면 분 창이 비어도 429 다")
    void blocksOverPerHourLimit() {
        // 다섯 번씩 61초 간격으로 네 묶음 — 어느 1분 창에도 다섯 건을 넘지 않지만 1시간 안에 스무 건이 쌓인다.
        int batches = StepUpAttemptRateLimiter.PER_HOUR_LIMIT / StepUpAttemptRateLimiter.PER_MINUTE_LIMIT;
        for (int batch = 0; batch < batches; batch++) {
            LocalDateTime batchTime = NOW.plusSeconds(61L * batch);
            for (int attempt = 0; attempt < StepUpAttemptRateLimiter.PER_MINUTE_LIMIT; attempt++) {
                rateLimiter.recordFailureOrThrow(USER_ID, batchTime);
            }
        }
        LocalDateTime afterMinuteWindowEmptied = NOW.plusSeconds(61L * batches);

        assertThatThrownBy(() -> rateLimiter.recordFailureOrThrow(USER_ID, afterMinuteWindowEmptied))
                .isInstanceOf(UserException.TooManyStepUpAttemptsException.class);
        assertThatThrownBy(() -> rateLimiter.assertWithinLimit(USER_ID, afterMinuteWindowEmptied))
                .isInstanceOf(UserException.TooManyStepUpAttemptsException.class);
    }

    @Test
    @DisplayName("이른 검사는 한도 미만이면 통과하고 기록하지 않는다")
    void assertWithinLimitPassesBelowLimitWithoutRecording() {
        for (int check = 0; check < StepUpAttemptRateLimiter.PER_HOUR_LIMIT * 2; check++) {
            assertThatCode(() -> rateLimiter.assertWithinLimit(USER_ID, NOW)).doesNotThrowAnyException();
        }
        for (int attempt = 0; attempt < StepUpAttemptRateLimiter.PER_MINUTE_LIMIT - 1; attempt++) {
            rateLimiter.recordFailureOrThrow(USER_ID, NOW);
        }
        assertThatCode(() -> rateLimiter.assertWithinLimit(USER_ID, NOW)).doesNotThrowAnyException();

        // 검사가 기록했다면 이 실패는 한도를 넘어 429 였다.
        assertThatCode(() -> rateLimiter.recordFailureOrThrow(USER_ID, NOW)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("다른 사용자의 실패는 섞이지 않는다")
    void usersAreCountedSeparately() {
        for (int attempt = 0; attempt < StepUpAttemptRateLimiter.PER_MINUTE_LIMIT; attempt++) {
            rateLimiter.recordFailureOrThrow(USER_ID, NOW);
        }

        assertThatCode(() -> rateLimiter.assertWithinLimit(OTHER_USER_ID, NOW)).doesNotThrowAnyException();
        assertThatCode(() -> rateLimiter.recordFailureOrThrow(OTHER_USER_ID, NOW)).doesNotThrowAnyException();
    }
}
