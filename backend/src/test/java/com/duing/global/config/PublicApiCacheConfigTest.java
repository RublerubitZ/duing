package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cache.Cache;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 공개 API 마이크로 캐시의 만료·상한·동시성 계약 단위 테스트.
 *
 * <p>만료는 벽시계 대기 없이 가짜 {@code Ticker} 의 나노초를 직접 밀어 확인하고, 동시성은 래치로
 * 스레드 진입 순서를 고정해 확인한다 — 두 축 모두 sleep 이 없어 결정적이다.
 */
class PublicApiCacheConfigTest {

    private static final long TTL_MS = 60_000L;
    private static final int MAX_ENTRIES = 200;
    private static final int CONCURRENT_CALLERS = 20;
    private static final String CACHE_KEY = "동아리목록:1페이지";
    // ConcurrentHashMap 의 해시 빈이 갈라지는 값 — 서로 다른 키의 로더가 직렬화되지 않음을 결정적으로 본다.
    private static final Object FIRST_BIN_KEY = 0;
    private static final Object SECOND_BIN_KEY = 1;

    /** 테스트가 직접 미는 가짜 시계. */
    private final AtomicLong elapsedNanos = new AtomicLong();

    @Test
    @DisplayName("TTL 이 지나기 전에 같은 키를 다시 조회하면 로더를 다시 실행하지 않고 캐시된 값을 돌려준다")
    void cachedEntryIsReusedBeforeTtlElapses() {
        CaffeineCache cache = cacheWithFakeTicker(MAX_ENTRIES);
        AtomicInteger loaderCallCount = new AtomicInteger();
        Callable<String> countingLoader = () -> {
            loaderCallCount.incrementAndGet();
            return "동아리목록결과";
        };

        assertThat(cache.get(CACHE_KEY, countingLoader)).isEqualTo("동아리목록결과");
        elapsedNanos.addAndGet(Duration.ofMillis(TTL_MS - 1).toNanos());

        assertThat(cache.get(CACHE_KEY, countingLoader)).isEqualTo("동아리목록결과");
        assertThat(loaderCallCount).hasValue(1);
    }

    @Test
    @DisplayName("엔트리는 TTL 이 지나면 개별적으로 만료돼 다음 조회가 로더를 다시 실행한다")
    void entryExpiresIndividuallyAfterTtl() {
        CaffeineCache cache = cacheWithFakeTicker(MAX_ENTRIES);
        AtomicInteger loaderCallCount = new AtomicInteger();
        Callable<String> countingLoader = () -> {
            loaderCallCount.incrementAndGet();
            return "동아리목록결과";
        };
        cache.get(CACHE_KEY, countingLoader);

        elapsedNanos.addAndGet(Duration.ofMillis(TTL_MS + 1).toNanos());

        assertThat(cache.get(CACHE_KEY, countingLoader)).isEqualTo("동아리목록결과");
        assertThat(loaderCallCount).hasValue(2);
    }

    @Test
    @DisplayName("엔트리 수가 상한을 넘으면 오래된 엔트리가 축출돼 캐시 크기가 상한을 넘어 유지되지 않는다")
    void entriesAreEvictedOnceMaximumSizeIsExceeded() {
        int maxEntries = 2;
        // 축출을 호출 스레드에서 끝내려고 executor 만 프로덕션 빌더와 다르게 준다(기본은 비동기라 비결정적).
        CaffeineCache cache = new CaffeineCache("상한테스트캐시", Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMillis(TTL_MS))
                .maximumSize(maxEntries)
                .ticker(elapsedNanos::get)
                .executor(Runnable::run)
                .build(), true);

        cache.put("첫번째키", "A");
        cache.put("두번째키", "B");
        cache.put("상한초과키", "C");
        cache.getNativeCache().cleanUp();

        // 어느 키가 살아남는지는 축출 정책(W-TinyLFU)의 몫이라 단언하지 않는다 — 힙 상한만이 계약이다.
        assertThat(cache.getNativeCache().estimatedSize()).isLessThanOrEqualTo(maxEntries);
    }

    @Test
    @DisplayName("캐시 설정에는 주기적 전량 비움 스케줄이 남아 있지 않다")
    void noScheduledEvictionRemains() {
        assertThat(PublicApiCacheConfig.class.getDeclaredMethods())
                .allSatisfy(method -> assertThat(method.getAnnotationsByType(Scheduled.class)).isEmpty());
        assertThat(PublicApiCacheConfig.class.getAnnotation(EnableScheduling.class)).isNull();
    }

    @Test
    @DisplayName("같은 키로 동시에 들어온 조회는 로더를 한 번만 실행하고 모든 호출자가 같은 값을 받는다")
    void concurrentLoadsOfTheSameKeyRunTheLoaderOnce() throws Exception {
        CaffeineCache cache = cacheWithFakeTicker(MAX_ENTRIES);
        AtomicInteger loaderCallCount = new AtomicInteger();
        CountDownLatch allCallersEntered = new CountDownLatch(CONCURRENT_CALLERS);
        CountDownLatch loaderRelease = new CountDownLatch(1);
        Callable<String> blockingLoader = () -> {
            loaderCallCount.incrementAndGet();
            if (!loaderRelease.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("로더가 해제되지 않았다");
            }
            return "공유결과";
        };

        ExecutorService callers = Executors.newFixedThreadPool(CONCURRENT_CALLERS);
        try {
            List<Future<String>> results = new ArrayList<>();
            for (int callerIndex = 0; callerIndex < CONCURRENT_CALLERS; callerIndex++) {
                results.add(callers.submit(() -> {
                    allCallersEntered.countDown();
                    return cache.get(CACHE_KEY, blockingLoader);
                }));
            }

            // 모든 호출자가 캐시 진입까지 간 뒤에 로더를 풀어 준다 — 병합이 깨졌다면 20개 로더가 모두 실행된다.
            assertThat(allCallersEntered.await(5, TimeUnit.SECONDS)).isTrue();
            loaderRelease.countDown();
            for (Future<String> result : results) {
                assertThat(result.get(5, TimeUnit.SECONDS)).isEqualTo("공유결과");
            }
        } finally {
            callers.shutdownNow();
        }

        assertThat(loaderCallCount).hasValue(1);
    }

    @Test
    @DisplayName("서로 다른 키의 로더는 한쪽이 계산 중이어도 서로 기다리지 않는다")
    void loadsOfDifferentKeysAreNotSerialized() throws Exception {
        CaffeineCache cache = cacheWithFakeTicker(MAX_ENTRIES);
        CountDownLatch secondKeyLoaderStarted = new CountDownLatch(1);

        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            // 첫 키의 로더는 둘째 키의 로더가 시작할 때까지 붙잡는다 — 직렬화되면 여기서 타임아웃한다.
            Future<String> firstKeyResult = callers.submit(() -> cache.get(FIRST_BIN_KEY, () -> {
                if (!secondKeyLoaderStarted.await(2, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("다른 키의 로더가 첫 키 뒤로 직렬화됐다");
                }
                return "첫키결과";
            }));
            Future<String> secondKeyResult = callers.submit(() -> cache.get(SECOND_BIN_KEY, () -> {
                secondKeyLoaderStarted.countDown();
                return "둘째키결과";
            }));

            assertThat(firstKeyResult.get(5, TimeUnit.SECONDS)).isEqualTo("첫키결과");
            assertThat(secondKeyResult.get(5, TimeUnit.SECONDS)).isEqualTo("둘째키결과");
        } finally {
            callers.shutdownNow();
        }
    }

    /**
     * 로더 실패는 캐시에 남지 않는다. 여기서는 캐시를 직접 호출해 {@link Cache.ValueRetrievalException}
     * 으로 감싼 형태를 보지만, {@code @Cacheable} 프록시를 거치면 Spring 이 이 껍데기를 풀어 원 예외를
     * 호출자에게 그대로 던진다.
     */
    @Test
    @DisplayName("로더가 실패하면 예외가 호출자에게 전파되고 엔트리가 남지 않아 다음 조회가 다시 로드한다")
    void failedLoadIsNotCachedAndIsRetriedOnNextGet() {
        CaffeineCache cache = cacheWithFakeTicker(MAX_ENTRIES);
        AtomicInteger loaderCallCount = new AtomicInteger();
        Callable<String> failingThenSucceedingLoader = () -> {
            if (loaderCallCount.incrementAndGet() == 1) {
                throw new IllegalStateException("DB 조회 실패");
            }
            return "재로드결과";
        };

        assertThatThrownBy(() -> cache.get(CACHE_KEY, failingThenSucceedingLoader))
                .isInstanceOf(Cache.ValueRetrievalException.class)
                .hasCauseInstanceOf(IllegalStateException.class);

        assertThat(cache.get(CACHE_KEY)).isNull();
        assertThat(cache.get(CACHE_KEY, failingThenSucceedingLoader)).isEqualTo("재로드결과");
        assertThat(loaderCallCount).hasValue(2);
    }

    private CaffeineCache cacheWithFakeTicker(int maxEntries) {
        return PublicApiCacheConfig.caffeineCache("테스트캐시", maxEntries, TTL_MS, elapsedNanos::get);
    }
}
