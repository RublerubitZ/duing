package com.duing.domain.club.metric.job;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.duing.domain.club.metric.service.ClubMetricService;
import com.duing.global.config.PublicApiCacheConfig;
import com.duing.global.frontend.FrontendRevalidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;

@ExtendWith(MockitoExtension.class)
class ClubMetricRefreshJobTest {

    @Mock ClubMetricService clubMetricService;
    @Mock ObjectProvider<CacheManager> cacheManagerProvider;
    @Mock CacheManager cacheManager;
    @Mock Cache clubSearchCache;
    @Mock FrontendRevalidator frontendRevalidator;

    private ClubMetricRefreshJob job;

    @BeforeEach
    void setUp() {
        job = new ClubMetricRefreshJob(clubMetricService, cacheManagerProvider, frontendRevalidator);
    }

    private void givenClubSearchCache() {
        when(cacheManagerProvider.getIfAvailable()).thenReturn(cacheManager);
        when(cacheManager.getCache(PublicApiCacheConfig.CLUB_SEARCH_CACHE)).thenReturn(clubSearchCache);
    }

    @Test
    @DisplayName("정각 실행은 재집계 → 공개 목록 캐시 비우기 → /clubs 재생성 요청 순서로 돈다")
    void hourlyRunEvictsCacheThenRevalidates() {
        givenClubSearchCache();

        job.refresh();

        InOrder inOrder = inOrder(clubMetricService, clubSearchCache, frontendRevalidator);
        inOrder.verify(clubMetricService).refreshAll();
        inOrder.verify(clubSearchCache).clear();
        inOrder.verify(frontendRevalidator).revalidate("/clubs");
    }

    @Test
    @DisplayName("재집계가 실패해도 정각 셔플은 바뀌었으므로 캐시를 비우고 재생성을 요청한다")
    void refreshFailureStillEvictsAndRevalidates() {
        givenClubSearchCache();
        doThrow(new IllegalStateException("db down")).when(clubMetricService).refreshAll();

        assertThatCode(() -> job.refresh()).doesNotThrowAnyException();

        InOrder inOrder = inOrder(clubSearchCache, frontendRevalidator);
        inOrder.verify(clubSearchCache).clear();
        inOrder.verify(frontendRevalidator).revalidate("/clubs");
    }

    @Test
    @DisplayName("캐시 설정이 꺼져 캐시 매니저가 없어도 재생성은 요청한다")
    void noCacheManagerStillRevalidates() {
        when(cacheManagerProvider.getIfAvailable()).thenReturn(null);

        job.refresh();

        verify(frontendRevalidator).revalidate("/clubs");
    }

    @Test
    @DisplayName("캐시 매니저에 목록 캐시가 없어도 재생성은 요청한다")
    void missingCacheStillRevalidates() {
        when(cacheManagerProvider.getIfAvailable()).thenReturn(cacheManager);
        when(cacheManager.getCache(PublicApiCacheConfig.CLUB_SEARCH_CACHE)).thenReturn(null);

        job.refresh();

        verify(frontendRevalidator).revalidate("/clubs");
    }

    @Test
    @DisplayName("캐시 비우기가 던져도 삼키고 재생성은 요청한다")
    void evictFailureStillRevalidates() {
        givenClubSearchCache();
        doThrow(new IllegalStateException("cache broken")).when(clubSearchCache).clear();

        assertThatCode(() -> job.refresh()).doesNotThrowAnyException();

        verify(frontendRevalidator).revalidate("/clubs");
    }

    @Test
    @DisplayName("기동 직후 실행은 재집계만 한다 — 캐시·프론트는 건드리지 않는다")
    void startupRunOnlyRefreshesMetrics() {
        job.refreshOnStartup();

        verify(clubMetricService).refreshAll();
        verifyNoInteractions(cacheManagerProvider, frontendRevalidator);
    }
}
