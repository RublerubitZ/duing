package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.PhoneVerificationException;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MoPollThrottleTest {

    private static final String TOKEN = "token-a";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 10, 12, 0);

    private final MoPollThrottle pollThrottle = new MoPollThrottle();

    @Test
    @DisplayName("같은 세션의 Octomo 실호출은 2.5초 간격을 지켜야 한다 — 첫 호출 허용, 직후 거절, 간격 후 허용")
    void enforcesMinIntervalPerSession() {
        assertThat(pollThrottle.tryAcquire(TOKEN, NOW)).isTrue();
        assertThat(pollThrottle.tryAcquire(TOKEN, NOW.plusSeconds(1))).isFalse();
        assertThat(pollThrottle.tryAcquire(TOKEN, NOW.plus(MoPollThrottle.MIN_POLL_INTERVAL))).isTrue();
    }

    @Test
    @DisplayName("세션이 다르면 간격을 서로 공유하지 않는다")
    void sessionsAreIndependent() {
        assertThat(pollThrottle.tryAcquire("token-a", NOW)).isTrue();
        assertThat(pollThrottle.tryAcquire("token-b", NOW)).isTrue();
    }

    @Test
    @DisplayName("실호출이 누적되면 세션당 최소 간격이 넓어진다 — 5콜까지 2.5초, 8콜까지 4.5초, 이후 7.5초")
    void backoffLadderWidensIntervalWithGrantedCalls() {
        LocalDateTime pollCursor = NOW;
        assertThat(pollThrottle.tryAcquire(TOKEN, pollCursor)).isTrue(); // 1번째
        for (int grantedCall = 2; grantedCall <= MoPollThrottle.FAST_TIER_CALL_LIMIT; grantedCall++) {
            pollCursor = pollCursor.plus(MoPollThrottle.MIN_POLL_INTERVAL);
            assertThat(pollThrottle.tryAcquire(TOKEN, pollCursor)).isTrue(); // 2~5번째
        }
        // 6번째부터는 2.5초 간격으로는 거절되고 4.5초가 필요하다.
        assertThat(pollThrottle.tryAcquire(TOKEN, pollCursor.plus(MoPollThrottle.MIN_POLL_INTERVAL))).isFalse();
        for (int grantedCall = MoPollThrottle.FAST_TIER_CALL_LIMIT + 1;
                grantedCall <= MoPollThrottle.MID_TIER_CALL_LIMIT; grantedCall++) {
            pollCursor = pollCursor.plus(MoPollThrottle.MID_POLL_INTERVAL);
            assertThat(pollThrottle.tryAcquire(TOKEN, pollCursor)).isTrue(); // 6~8번째
        }
        // 9번째부터는 4.5초 간격으로도 거절되고 7.5초가 필요하다.
        assertThat(pollThrottle.tryAcquire(TOKEN, pollCursor.plus(MoPollThrottle.MID_POLL_INTERVAL))).isFalse();
        assertThat(pollThrottle.tryAcquire(TOKEN, pollCursor.plus(MoPollThrottle.SLOW_POLL_INTERVAL))).isTrue();
    }

    @Test
    @DisplayName("백오프 단계는 토큰별로 독립이다 — 한 세션이 느려져도 새 세션(재발급)은 빠른 간격으로 시작한다")
    void backoffLadderIsIndependentPerToken() {
        LocalDateTime pollCursor = NOW;
        for (int grantedCall = 1; grantedCall <= MoPollThrottle.MID_TIER_CALL_LIMIT; grantedCall++) {
            assertThat(pollThrottle.tryAcquire("slow-token", pollCursor)).isTrue();
            pollCursor = pollCursor.plus(MoPollThrottle.MID_POLL_INTERVAL);
        }
        // slow-token 은 이제 7.5초가 필요하지만, 새 토큰은 2.5초 간격으로 시작한다.
        assertThat(pollThrottle.tryAcquire("fresh-token", pollCursor)).isTrue();
        assertThat(pollThrottle.tryAcquire("fresh-token",
                pollCursor.plus(MoPollThrottle.MIN_POLL_INTERVAL))).isTrue();
    }

    @Test
    @DisplayName("사다리 각 티어는 프론트 폴링 백오프(3s/5s/8s)보다 0.5초 이상 좁고 경계(5·8콜)가 일치한다 — 헛폴링 방지 커플링 가드")
    void ladderStaysAlignedWithFrontendPollingBackoff() {
        // frontend/packages/hooks/src/auth.ts 의 phoneVerificationPollIntervalMs(3s/5s/8s, 경계 5·8)와
        // 커플링돼 있다 — 한쪽만 바꾸면 프론트 폴링이 스로틀에 걸려 벤더 미호출로 헛도는 구간이 생긴다.
        assertThat(MoPollThrottle.MIN_POLL_INTERVAL.toMillis()).isLessThanOrEqualTo(3000 - 500);
        assertThat(MoPollThrottle.MID_POLL_INTERVAL.toMillis()).isLessThanOrEqualTo(5000 - 500);
        assertThat(MoPollThrottle.SLOW_POLL_INTERVAL.toMillis()).isLessThanOrEqualTo(8000 - 500);
        assertThat(MoPollThrottle.FAST_TIER_CALL_LIMIT).isEqualTo(5);
        assertThat(MoPollThrottle.MID_TIER_CALL_LIMIT).isEqualTo(8);
    }

    @Test
    @DisplayName("전역 일일 상한(1,000콜)을 넘기면 503 을 던지고, 날짜가 바뀌면 카운터가 리셋된다")
    void dailyQuotaLimitsAndRollsOver() {
        for (int call = 0; call < MoPollThrottle.DAILY_CALL_LIMIT; call++) {
            pollThrottle.reserveDailyQuota(NOW);
        }
        assertThatThrownBy(() -> pollThrottle.reserveDailyQuota(NOW))
                .isInstanceOf(PhoneVerificationException.SmsPollQuotaExceededException.class);
        assertThatCode(() -> pollThrottle.reserveDailyQuota(NOW.plusDays(1)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("동시 예약이 몰려도 일일 상한을 정확히 지킨다 — 초과분은 전부 거절된다")
    void concurrentReservationsRespectDailyLimit() throws InterruptedException {
        int threadCount = 32;
        int attemptsPerThread = 40; // 32×40 = 1,280 > 1,000
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        AtomicInteger grantedCount = new AtomicInteger();
        for (int thread = 0; thread < threadCount; thread++) {
            executor.submit(() -> {
                try {
                    startLatch.await();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
                for (int attempt = 0; attempt < attemptsPerThread; attempt++) {
                    try {
                        pollThrottle.reserveDailyQuota(NOW);
                        grantedCount.incrementAndGet();
                    } catch (PhoneVerificationException.SmsPollQuotaExceededException rejected) {
                        // 상한 초과 — 기대되는 거절.
                    }
                }
            });
        }
        startLatch.countDown();
        executor.shutdown();
        assertThat(executor.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        assertThat(grantedCount.get()).isEqualTo(MoPollThrottle.DAILY_CALL_LIMIT);
    }

    @Test
    @DisplayName("실패한 벤더 호출의 쿼터는 반환된다 — 같은 날짜에만 유효하다")
    void releaseDailyQuotaRefundsSameDayOnly() {
        for (int call = 0; call < MoPollThrottle.DAILY_CALL_LIMIT; call++) {
            pollThrottle.reserveDailyQuota(NOW);
        }
        assertThatThrownBy(() -> pollThrottle.reserveDailyQuota(NOW))
                .isInstanceOf(PhoneVerificationException.SmsPollQuotaExceededException.class);

        pollThrottle.releaseDailyQuota(NOW);
        assertThatCode(() -> pollThrottle.reserveDailyQuota(NOW)).doesNotThrowAnyException();

        // 다른 날짜의 반환은 현재 카운터에 영향을 주지 않는다 — 다시 만석이라 초과는 거절.
        pollThrottle.releaseDailyQuota(NOW.minusDays(1));
        assertThatThrownBy(() -> pollThrottle.reserveDailyQuota(NOW))
                .isInstanceOf(PhoneVerificationException.SmsPollQuotaExceededException.class);
    }

    @Test
    @DisplayName("예약 없이 반환해도 카운터가 음수가 되어 상한이 늘어나지 않는다")
    void releaseWithoutReserveDoesNotExtendLimit() {
        pollThrottle.releaseDailyQuota(NOW); // 카운터 미가동 상태 — 무시돼야 한다.
        for (int call = 0; call < MoPollThrottle.DAILY_CALL_LIMIT; call++) {
            pollThrottle.reserveDailyQuota(NOW);
        }
        assertThatThrownBy(() -> pollThrottle.reserveDailyQuota(NOW))
                .isInstanceOf(PhoneVerificationException.SmsPollQuotaExceededException.class);
    }

    @Test
    @DisplayName("추적 토큰이 임계를 넘으면 오래된 간격 엔트리를 지연 정리한다 — 무한 누적 방지")
    void sweepEvictsStaleTokenEntries() {
        for (int index = 0; index <= MoPollThrottle.TOKEN_SWEEP_THRESHOLD; index++) {
            pollThrottle.tryAcquire("stale-" + index, NOW);
        }
        assertThat(pollThrottle.trackedTokenCount()).isGreaterThan(MoPollThrottle.TOKEN_SWEEP_THRESHOLD);

        // 보존 기간을 넘긴 시점의 새 폴링이 정리를 트리거한다 — 오래된 엔트리는 전부 제거되고 새 것만 남는다.
        pollThrottle.tryAcquire("fresh", NOW.plus(MoPollThrottle.TOKEN_ENTRY_RETENTION).plusSeconds(1));

        assertThat(pollThrottle.trackedTokenCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("reset 은 간격 기록과 일일 카운터를 모두 초기화한다 (통합 테스트 격리용)")
    void resetClearsState() {
        pollThrottle.tryAcquire(TOKEN, NOW);
        for (int call = 0; call < MoPollThrottle.DAILY_CALL_LIMIT; call++) {
            pollThrottle.reserveDailyQuota(NOW);
        }
        pollThrottle.reset();
        assertThat(pollThrottle.tryAcquire(TOKEN, NOW.plusSeconds(1))).isTrue();
        assertThatCode(() -> pollThrottle.reserveDailyQuota(NOW)).doesNotThrowAnyException();
    }
}
