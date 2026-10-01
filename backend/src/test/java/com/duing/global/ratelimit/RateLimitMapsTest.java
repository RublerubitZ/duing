package com.duing.global.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.benmanes.caffeine.cache.Cache;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 레이트리미터 기록 맵의 만료·상한 계약 — 가짜 {@code Ticker} 로 시계를 밀어 sleep 없이 확인한다.
 */
class RateLimitMapsTest {

    private static final Duration TTL = Duration.ofHours(1);
    private static final String CLIENT_IP = "203.0.113.7";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 1, 12, 0);

    /** 테스트가 직접 미는 가짜 시계. */
    private final AtomicLong elapsedNanos = new AtomicLong();

    @Test
    @DisplayName("마지막 기록 뒤 창 길이가 지나면 키가 만료돼 맵이 빈다")
    void keysExpireOnceTtlElapsesAfterLastRecord() {
        Cache<String, Deque<LocalDateTime>> cache = RateLimitMaps.expiringCache(TTL, elapsedNanos::get);
        recordRequest(cache, CLIENT_IP);
        recordRequest(cache, "198.51.100.9");

        elapsedNanos.addAndGet(TTL.plusNanos(1).toNanos());
        cache.cleanUp();

        assertThat(cache.asMap()).isEmpty();
    }

    @Test
    @DisplayName("같은 Deque 를 돌려주는 기록도 쓰기로 계산돼 만료 시계가 마지막 기록부터 다시 잰다")
    void recordReturningSameDequeRestartsExpiry() {
        Cache<String, Deque<LocalDateTime>> cache = RateLimitMaps.expiringCache(TTL, elapsedNanos::get);
        recordRequest(cache, CLIENT_IP);
        elapsedNanos.addAndGet(TTL.minusMinutes(1).toNanos());
        recordRequest(cache, CLIENT_IP);

        // 첫 기록으로부터는 ttl 이 지났지만 마지막 기록으로부터는 2분뿐이다.
        elapsedNanos.addAndGet(Duration.ofMinutes(2).toNanos());
        cache.cleanUp();

        assertThat(cache.asMap()).containsKey(CLIENT_IP);
        assertThat(cache.asMap().get(CLIENT_IP)).hasSize(2);
    }

    @Test
    @DisplayName("고유 키가 상한보다 많이 들어와도 정리 뒤 맵 크기는 상한을 넘지 않는다")
    void keyCountStaysWithinMaximum() {
        Cache<String, Deque<LocalDateTime>> cache = RateLimitMaps.expiringCache(TTL, elapsedNanos::get);
        for (long keyIndex = 0; keyIndex < RateLimitMaps.MAX_KEYS + 100; keyIndex++) {
            recordRequest(cache, "client-" + keyIndex);
        }

        cache.cleanUp();

        // 어느 키가 남는지는 축출 정책(W-TinyLFU)의 몫이라 단언하지 않는다 — 힙 상한만이 계약이다.
        assertThat(cache.estimatedSize()).isLessThanOrEqualTo(RateLimitMaps.MAX_KEYS);
    }

    /** 리미터와 같은 모양의 기록 — 기존 Deque 에 시각을 붙여 같은 인스턴스를 돌려준다. */
    private void recordRequest(Cache<String, Deque<LocalDateTime>> cache, String windowKey) {
        cache.asMap().compute(windowKey, (key, requestTimes) -> {
            Deque<LocalDateTime> windowTimes = requestTimes == null ? new ArrayDeque<>() : requestTimes;
            windowTimes.addLast(NOW);
            return windowTimes;
        });
    }
}
