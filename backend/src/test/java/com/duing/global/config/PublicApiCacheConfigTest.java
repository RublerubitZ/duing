package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cache.Cache;
import org.springframework.cache.support.SimpleCacheManager;

class PublicApiCacheConfigTest {

    private static final int MAX_ENTRIES = 2;

    @Test
    @DisplayName("엔트리 상한에 도달하면 새 키는 저장하지 않고 기존 엔트리는 그대로 유지한다")
    void boundedCacheRejectsNewKeysAtLimitAndKeepsExistingEntries() {
        Cache cache = clubSearchCache(new PublicApiCacheConfig(MAX_ENTRIES));

        cache.put("첫번째키", "A");
        cache.put("두번째키", "B");
        cache.put("상한초과키", "C");

        assertThat(cache.get("상한초과키")).isNull();
        assertThat(cache.get("첫번째키").get()).isEqualTo("A");
        assertThat(cache.get("두번째키").get()).isEqualTo("B");
    }

    @Test
    @DisplayName("상한에 도달해도 이미 캐시된 키의 값은 갱신할 수 있다")
    void boundedCacheStillUpdatesAlreadyCachedKeyAtLimit() {
        Cache cache = clubSearchCache(new PublicApiCacheConfig(MAX_ENTRIES));
        cache.put("첫번째키", "A");
        cache.put("두번째키", "B");

        cache.put("첫번째키", "A-갱신");

        assertThat(cache.get("첫번째키").get()).isEqualTo("A-갱신");
    }

    @Test
    @DisplayName("TTL 경과 시 호출되는 비움이 모든 엔트리를 제거한다")
    void ttlEvictionClearsEveryEntry() {
        PublicApiCacheConfig cacheConfig = new PublicApiCacheConfig(MAX_ENTRIES);
        Cache cache = clubSearchCache(cacheConfig);
        cache.put("첫번째키", "A");

        cacheConfig.evictAllOnTtlElapsed();

        assertThat(cache.get("첫번째키")).isNull();
    }

    private static Cache clubSearchCache(PublicApiCacheConfig cacheConfig) {
        SimpleCacheManager cacheManager = (SimpleCacheManager) cacheConfig.publicApiCacheManager();
        // 스프링 컨텍스트 밖에서는 InitializingBean 콜백이 불리지 않아 직접 초기화한다.
        cacheManager.afterPropertiesSet();
        return cacheManager.getCache(PublicApiCacheConfig.CLUB_SEARCH_CACHE);
    }
}
