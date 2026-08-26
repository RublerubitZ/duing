package com.duing.global.config;

import java.util.List;
import java.util.concurrent.ConcurrentMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

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
 * <p>TTL 은 주기적 전량 비움으로 구현한다. 엔트리별 만료가 아니라서 실제 수명은 0~TTL 사이지만,
 * "최대 TTL 초 이상 낡은 응답은 없다"는 상한은 보장된다. 엔트리별 만료가 필요해지면 별도 캐시
 * 라이브러리 도입 대신 {@link Cache} 구현을 교체하면 된다.
 *
 * <p>단일 인스턴스(Lightsail 1대) 전제의 힙 캐시다. 인스턴스를 늘리면 인스턴스 수만큼 miss 가
 * 늘 뿐 정합성 문제는 없다(각자 최대 TTL 초 낡은 값).
 */
@Configuration
@EnableScheduling
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

    private final List<Cache> publicApiCaches;

    public PublicApiCacheConfig(@Value("${duing.public-api-cache.max-entries:200}") int maxEntries) {
        this.publicApiCaches = List.of(
                boundedCache(CLUB_SEARCH_CACHE, maxEntries),
                boundedCache(RECRUITMENT_CALENDAR_CACHE, maxEntries));
    }

    @Bean
    public CacheManager publicApiCacheManager() {
        SimpleCacheManager cacheManager = new SimpleCacheManager();
        // 이름을 고정 목록으로 등록한다 — 오타난 캐시명은 기동/호출 시점에 바로 드러난다.
        cacheManager.setCaches(publicApiCaches);
        return cacheManager;
    }

    /**
     * TTL 경과 시 전량 비움. {@code fixedRate} 라 마지막 실행 완료 시각이 아니라 시작 시각 기준으로
     * 반복되므로, 엔트리가 살아 있는 시간은 최대 TTL 이다. 단, Spring 기본 단일 스레드 TaskScheduler 를
     * 다른 {@code @Scheduled} 잡(시설 크롤 등)과 공유하므로 앞선 잡이 오래 걸리면 비움이 밀려
     * staleness 상한이 TTL+지연만큼 늘 수 있다(prod 크롤 실측 ~5초 수준이라 실해는 미미).
     */
    @Scheduled(fixedRateString = "${duing.public-api-cache.ttl-ms:60000}")
    public void evictAllOnTtlElapsed() {
        publicApiCaches.forEach(Cache::clear);
    }

    /**
     * 엔트리 수 상한이 있는 {@link ConcurrentMapCache}. keyword·tags 처럼 값이 무제한인 질의
     * 파라미터가 캐시 키에 들어가므로, 상한이 없으면 비인증 요청만으로 힙을 채울 수 있다.
     *
     * <p>상한 도달 후에는 새 키를 받지 않는다(기존 엔트리는 TTL 까지 유지). 최악의 경우 캐시가 잠깐
     * 무용해질 뿐 캐시가 없던 상태보다 나빠지지 않는다. size 확인과 put 사이의 경합으로 상한을 몇 개
     * 넘길 수 있는 근사 상한이며, 정밀한 LRU 가 필요해지면 이 구현만 교체한다.
     */
    private static Cache boundedCache(String cacheName, int maxEntries) {
        return new ConcurrentMapCache(cacheName) {
            @Override
            public void put(Object key, Object value) {
                ConcurrentMap<Object, Object> store = getNativeCache();
                if (store.size() >= maxEntries && !store.containsKey(key)) {
                    return;
                }
                super.put(key, value);
            }
        };
    }
}
