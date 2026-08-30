package com.duing.global.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import com.github.benmanes.caffeine.cache.Ticker;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.DoubleSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * 공개(비개인화) 조회 API 의 인메모리 마이크로 캐시.
 *
 * <p>대상 엔드포인트는 이미 {@code Cache-Control: public, max-age=60} 을 선언해 "60초까지의 공유 캐시가
 * 안전하다"는 정책이 확정된 응답뿐이다. 다만 그 정책을 실현해 줄 공유 캐시가 실제 경로에 없다 —
 * api.duings.com 앞단 Cloudflare 는 확장자 없는 경로를 캐시하지 않고(cf-cache-status: DYNAMIC),
 * Caddy(caddy:2-alpine)에는 캐시 모듈이 없다. 그래서 우리가 통제할 수 있는 유일한 공유 지점인
 * 애플리케이션에서 같은 60초 정책을 실행한다. 캐시 히트는 DB 왕복(쿼리)을 통째로 없애므로
 * Supabase egress 가 줄어든다.
 *
 * <p>캐시 대상은 개인화가 전혀 없는 서비스 메서드로 한정하고, 키는 메서드 인자(= 질의 조건 + 페이지)
 * 전체로 잡아 쿼리 파라미터별로 분리한다. 인증 주체는 키에도 값에도 들어가지 않는다 — 인증/비인증
 * 응답이 섞일 수 있는 메서드는 아예 캐시하지 않는다.
 *
 * <p>TTL 은 Caffeine 의 엔트리별 만료로 적용한다. "최대 TTL 초 이상 낡은 응답은
 * 없다"는 상한은 예전의 주기적 전량 비움과 같지만, 모든 엔트리가 같은 순간에 함께 사라지지 않는다 —
 * 매분 전량 비움 직후 같은 키의 요청이 한꺼번에 DB 로 몰려 CPU 와 p99 가 튀던 스탬피드(2026-08-29
 * capacity 테스트)가 사라진다. 대신 엔트리의 평균 낡음은 TTL 의 절반(전량 비움은 수명 0~TTL 균등)
 * 수준으로 오르는데, 정책이 "평균"이 아니라 "상한"이므로 그대로 둔다.
 *
 * <p><b>TTL 지터</b> — 전량 비움을 없앤 뒤에도 매분 같은 초에 지연이 튀는 잔여 버스트가 남았다
 * (2026-08-30 Test A, 287 RPS: 그 초의 p99 244 ms vs 다른 초 55 ms). 엔트리별 만료인데도 위상이 겹쳐서다.
 * 인스턴스 기동 직후 인기 키가 한꺼번에 처음 적재되고, 트래픽이 끊기지 않으면 만료 즉시 재적재되어
 * 그 위상이 영구히 고정된다 — 결국 같은 초에 여러 키가 함께 만료돼 DB 로 몰린다. 그래서 엔트리마다
 * 수명을 TTL 의 5/6~1 배 사이에서 무작위로 잡아 만료를 흩는다. 상한은 여전히 TTL 이라 {@code max-age}
 * 정책은 그대로고, 같은 키가 재적재될 때마다 새 난수를 뽑으므로 위상이 다시 굳지 않는다.
 *
 * <p>대가는 재적재 횟수다. 평균 수명이 TTL 의 11/12(60초면 55초)로 짧아져 인기 키의 DB 재적재가
 * 약 9% 늘어난다 — 캐시가 이미 걷어내고 남은 몫의 9% 라 절대량은 작지만, 이 캐시의 1차 목적이
 * Supabase egress 절감이라 적어 둔다. 폭을 더 넓히면(예: 1/2~1) 그 비용이 33% 로 뛴다.
 *
 * <p>선반영(refresh-ahead)도 후보였지만 택하지 않았다. Spring 이 {@code sync} 조회에 넘겨주는 로더는
 * {@code MethodInvocation.proceed()} 한 번을 감싼 것이고, 그 호출은 인터셉터 인덱스를 되돌리지 않아
 * 재실행하면 남은 어드바이스(트랜잭션 포함)를 건너뛴다. 백그라운드 재적재를 위해 그 로더를 기억해
 * 두는 구조는 이 계약을 어기게 되므로, 관측된 원인(위상 동기화)만 정확히 없애는 지터를 쓴다.
 *
 * <p>엔트리 수 상한은 {@code maximumSize} 로 잡는다. keyword·tags 처럼 값이 무제한인 질의 파라미터가
 * 캐시 키에 들어가므로 상한이 없으면 비인증 요청만으로 힙을 채울 수 있다. 상한에 닿으면 새 키를
 * 거부하던 예전 구현과 달리 Caffeine 은 오래된/덜 쓰인 엔트리를 축출하므로(W-TinyLFU), 상한 도달 후
 * 캐시가 통째로 무용해지는 구간이 없다. 축출은 근사이므로 일시적으로 상한을 몇 개 넘길 수 있다.
 *
 * <p>동일 키 miss 병합 — 대상 메서드는 {@code @Cacheable(sync = true)} 라, 같은 키의 miss 가 동시에
 * 도착하면 로더(= DB 조회)를 한 번만 실행하고 나머지 스레드는 그 결과를 기다린다. Spring 이 이를
 * 이 캐시 구현의 키 단위 계산({@code CaffeineCache.get(key, Callable)})에 그대로 위임하므로, 엔트리가
 * 자연 만료되는 순간에 겹친 동시 miss 도 같은 경로로 병합된다 — 프로덕션에서 스탬피드를 막는 실제
 * 경로다.
 *
 * <p>단일 인스턴스(Lightsail 1대) 전제의 힙 캐시다. 인스턴스를 늘리면 인스턴스 수만큼 miss 가
 * 늘 뿐 정합성 문제는 없다(각자 최대 TTL 초 낡은 값).
 *
 * <p>테스트 규약 — 캐시는 Spring 컨텍스트와 함께 살아남으므로, 같은 컨텍스트를 공유하는 테스트들이
 * 같은 캐시 키(예: 모집 달력의 같은 YearMonth)를 재사용하면 앞 테스트의 엔트리(롤백된 데이터 포함)를
 * 읽는 오염이 생긴다. 캐시 대상 응답의 본문을 단언하는 테스트는 키를 유일하게 잡거나, 계측 전에
 * {@link #evictAll()} 를 호출해 miss 에서 시작할 것.
 */
@Configuration
// 캐시 어드바이스를 트랜잭션 어드바이스보다 바깥에 둔다. 안쪽이면 캐시 히트에도 readOnly 트랜잭션이
// 열려 커넥션을 잡고 SET TRANSACTION READ ONLY 왕복이 남아, 줄이려던 왕복이 그대로 남는다.
@EnableCaching(order = Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(prefix = "duing.public-api-cache", name = "enabled", havingValue = "true", matchIfMissing = true)
public class PublicApiCacheConfig {

    /** 동아리 목록 검색({@code GET /api/v1/clubs}) — 찜 필터(개인화) 요청은 제외하고 캐시한다. */
    public static final String CLUB_SEARCH_CACHE = "publicClubSearch";

    /**
     * 모집 달력({@code GET /api/v1/recruitments?yearMonth=}) — 개인화가 전혀 없고 키 공간이
     * 월 단위(십수 개)라 히트율이 가장 높다. 캐시 히트 시 projection 쿼리 1개와 readOnly 트랜잭션의
     * 커넥션 획득까지 사라진다(성능 감사 P1-5).
     */
    public static final String RECRUITMENT_CALENDAR_CACHE = "publicRecruitmentCalendar";

    /** 지터 하한 비율 — 수명은 TTL 의 5/6(60초면 50초)~1 배. 상한이 TTL 이라 정책을 넘지 않는다. */
    static final double MIN_TTL_RATIO = 5.0 / 6.0;

    private final List<Cache> publicApiCaches;

    public PublicApiCacheConfig(
            @Value("${duing.public-api-cache.max-entries:200}") int maxEntries,
            @Value("${duing.public-api-cache.ttl-ms:60000}") long ttlMs) {
        this.publicApiCaches = List.of(
                caffeineCache(CLUB_SEARCH_CACHE, maxEntries, ttlMs, Ticker.systemTicker()),
                caffeineCache(RECRUITMENT_CALENDAR_CACHE, maxEntries, ttlMs, Ticker.systemTicker()));
    }

    @Bean
    public CacheManager publicApiCacheManager() {
        SimpleCacheManager cacheManager = new SimpleCacheManager();
        // 이름을 고정 목록으로 등록한다 — 오타난 캐시명은 기동/호출 시점에 바로 드러난다.
        cacheManager.setCaches(publicApiCaches);
        return cacheManager;
    }

    /**
     * 모든 엔트리 제거. 스케줄되지 않는다 — TTL 은 엔트리별 만료가 담당하고, 이 메서드는 같은 Spring
     * 컨텍스트를 공유하는 테스트가 계측 전에 캐시를 miss 상태로 되돌리기 위한 리셋 전용이다.
     */
    public void evictAll() {
        publicApiCaches.forEach(Cache::clear);
    }

    /**
     * 엔트리별 TTL(지터 적용)과 크기 상한을 가진 캐시. {@code ticker} 는 단위 테스트가
     * 시계를 직접 밀어 만료를 결정적으로 검증하기 위한 이음매이며, 프로덕션은 항상 시스템 시계다.
     *
     * <p>{@code allowNullValues = true} — 대상 메서드가 null 을 돌려줄 일은 없지만, 값이 없다고
     * 캐시가 조용히 매번 로더를 부르는 구성보다 Spring 기본(null 래핑)을 유지하는 쪽이 안전하다.
     */
    static CaffeineCache caffeineCache(String cacheName, int maxEntries, long ttlMs, Ticker ticker) {
        // 프로덕션은 엔트리마다 난수를 뽑아 만료를 흩는다. 단위 테스트는 아래 오버로드로 이 값을 고정한다.
        // ThreadLocalRandom 은 쓰는 자리에서 current() 를 부르는 게 JDK 가 안내하는 관용구다(시드는
        // 호출 스레드에 있어 인스턴스를 들고 다녀도 되지만, 관용구를 따르는 편이 읽는 사람에게 분명하다).
        return caffeineCache(cacheName, maxEntries, ttlMs, ticker, () -> ThreadLocalRandom.current().nextDouble());
    }

    /**
     * {@code jitterFraction} 은 매 적재마다 0(포함)~1(미포함) 사이 값을 주는 이음매다 — 그 값이
     * 수명을 {@code ttlMs} 의 {@link #MIN_TTL_RATIO}~1 배 사이로 정한다. 테스트는 고정값을 넘겨
     * 만료 시점을 결정적으로 잡고, 프로덕션은 스레드별 난수를 쓴다.
     */
    static CaffeineCache caffeineCache(
            String cacheName, int maxEntries, long ttlMs, Ticker ticker, DoubleSupplier jitterFraction) {
        return new CaffeineCache(cacheName, Caffeine.newBuilder()
                // expireAfterWrite 대신 Expiry 를 쓰는 이유는 엔트리마다 수명을 달리 주기 위해서다.
                .expireAfter(new Expiry<Object, Object>() {
                    @Override
                    public long expireAfterCreate(Object key, Object value, long currentTime) {
                        return jitteredTtlNanos(ttlMs, jitterFraction.getAsDouble());
                    }

                    @Override
                    public long expireAfterUpdate(
                            Object key, Object value, long currentTime, long currentDuration) {
                        // 값이 새로 쓰였으니 수명도 새로 뽑는다. 현재 경로에서는 도달하지 않는다 —
                        // 두 대상 메서드가 모두 sync 조회라 만료 후 재적재까지 create 로 들어오고,
                        // 살아 있는 엔트리를 put 으로 덮는 코드가 없다. 나중에 그런 호출이 생겨도
                        // 수명이 이어붙지 않도록 create 와 같은 규칙을 둔다.
                        return jitteredTtlNanos(ttlMs, jitterFraction.getAsDouble());
                    }

                    @Override
                    public long expireAfterRead(Object key, Object value, long currentTime, long currentDuration) {
                        // 읽기는 수명을 늘리지 않는다 — "적재 후 최대 TTL" 상한을 지킨다.
                        return currentDuration;
                    }
                })
                .maximumSize(maxEntries)
                .ticker(ticker)
                .build(), true);
    }

    /** {@code jitterFraction} 0~1 을 TTL 의 {@link #MIN_TTL_RATIO}~1 배 수명(나노초)으로 바꾼다. */
    static long jitteredTtlNanos(long ttlMs, double jitterFraction) {
        double ratio = MIN_TTL_RATIO + (1.0 - MIN_TTL_RATIO) * jitterFraction;
        return Math.max(1L, Duration.ofMillis(Math.round(ttlMs * ratio)).toNanos());
    }
}
