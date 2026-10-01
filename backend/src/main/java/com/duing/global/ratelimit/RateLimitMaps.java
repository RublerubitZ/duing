package com.duing.global.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import java.time.Duration;
import java.util.concurrent.ConcurrentMap;

/**
 * 인메모리 레이트리미터의 기록 맵(키 → 요청 시각 Deque) — 키가 만료되고 키 수에 상한이 있다.
 *
 * <p>리미터는 {@code compute} 콜백 안에서 창 밖 시각을 정리하고 한도를 비교한다. 그 정리는 같은 키가
 * 다시 올 때만 일어나므로, 예전 {@code ConcurrentHashMap} 은 한 번 들어온 키를 지우지 않고 계속 들고 있었다.
 *
 * <p><b>ttl 은 그 맵이 판정에 쓰는 가장 긴 창 길이로 준다.</b> Caffeine 은 {@code compute} 를 쓰기로 계산해
 * 만료 시계를 다시 맞춘다. 그래서 마지막 기록 뒤 ttl 이 지나면 Deque 안의 시각이 전부 창 밖이라, 그 뒤에
 * 키를 지워도 다음 요청의 판정이 같다(빈 창에서 시작). 실제 만료는 ttl 에 {@link #EXPIRY_MARGIN} 을 더한
 * 뒤라 이 순서가 뒤집히지 않는다. 리미터가 쓰는 {@code compute}·{@code clear} 와 키 단위 원자성은
 * {@link Cache#asMap()} 이 {@code ConcurrentHashMap} 과 같게 보장한다.
 */
public final class RateLimitMaps {

    // 키 상한은 키 몫(맵당 2만 × 약 300B)만 묶는다. Deque 안 시각(건당 약 72B)은 키 상한이 아니라 처리량이
    // 묶는다 — 한 시각은 기록 뒤 창 + ttl + 여유(약 2시간) 안에 지워지므로, 그동안 수락된 요청 수만큼이다.
    // ponytail: 키 상한 2만, 넘치면 덜 쓰인 키의 카운터가 초기화된다 — 분산 공격이 문제가 되면 Redis·엣지 레이트리밋으로
    static final long MAX_KEYS = 20_000;

    // Caffeine 은 직전 쓰기 1초 안의 재기록엔 쓰기 시각을 갱신하지 않는다(EXPIRE_TOLERANCE) — 최대 1초 이른 만료를 덮는 여유.
    static final Duration EXPIRY_MARGIN = Duration.ofMinutes(1);

    private RateLimitMaps() {
    }

    /** 시스템 시계로 만료하는 기록 맵. {@code ttl} 은 그 맵이 판정에 쓰는 가장 긴 창 길이다. */
    public static <K, V> ConcurrentMap<K, V> expiringMap(Duration ttl) {
        return RateLimitMaps.<K, V>expiringCache(ttl, Ticker.systemTicker()).asMap();
    }

    /** 테스트 이음매 — 가짜 {@code Ticker} 로 시계를 밀고 {@code cleanUp()} 으로 만료·상한을 결정적으로 확인한다. */
    static <K, V> Cache<K, V> expiringCache(Duration ttl, Ticker ticker) {
        return Caffeine.newBuilder()
                .expireAfterWrite(ttl.plus(EXPIRY_MARGIN))
                .maximumSize(MAX_KEYS)
                .ticker(ticker)
                .build();
    }
}
