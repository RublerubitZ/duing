package com.duing.domain.club.metric.job;

import com.duing.domain.club.metric.service.ClubMetricService;
import com.duing.global.config.PublicApiCacheConfig;
import com.duing.global.frontend.FrontendRevalidator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 추천순 활동점수 집계 잡 — 매시 정각(Asia/Seoul) + 기동 직후 1회(빈 테이블 공백 방지).
 * 정각으로 둔 이유: 점수는 전체 최댓값 정규화라 재계산 시 전 동아리 finalScore 가 함께 움직인다 —
 * hour bucket 이 바뀌며 어차피 전면 reshuffle 되는 정각에 맞춰, bucket 중간의 두 번째 순서 변동
 * 지점을 만들지 않는다. 스케줄러는 {@code ClubMetricJobConfig} 가 자기 플래그로 켠다(무임승차 금지).
 * 실패해도 목록은 COALESCE(0)/이전 점수로 동작하므로(fail-open) 예외는 로그만 남기고 삼킨다 —
 * 특히 기동 리스너에서 예외가 전파되면 부팅이 실패한다.
 * {@code duing.club.metric.enabled=true} 에서만 등록.
 *
 * <p>정각 실행은 재집계 뒤 두 가지를 더 한다 — 정각에 바뀐 추천순을 화면에 바로 반영하기 위해서다.
 * 먼저 공개 동아리 목록 캐시({@code publicClubSearch})를 비운다: 키에 시간대(hour bucket)가 있어 직전 시간대
 * 엔트리는 정각부터 쓰이지 않지만, 정각 직후 재집계 커밋 전에 적재된 엔트리는 새 시간대 셔플에 옛 활동점수를 담는다.
 * 그다음 프론트에 {@code /clubs} 재생성을 요청한다: 캐시를 비운 뒤라야 재생성이 새 점수의 순서를 받는다(순서가
 * 바뀌면 직전 순서가 서버 HTML 에 한 시간 박제된다). 재집계가 실패하면 재생성 요청은 건너뛴다: 요청은 캐시 삭제라
 * Vercel 도 직전본 없이 그 자리에서 다시 만들고(cache-status REVALIDATED), 재집계 실패는 대개 DB 장애라 그 재생성이
 * 실패하면 회복까지 {@code /clubs} 가 오류 화면이 된다. 건너뛰면 1시간 주기 만료가 직전 페이지를 유지하며 다시
 * 시도한다(키에 시간대가 있어 그 재생성도 새 시간대 순서를 받는다). 재집계가 실패해도 비우기는 그대로 한다 — 점수가
 * 바뀌지 않아 필요는 없지만 엔트리가 한 번 더 적재될 뿐이다. 남는 틈: 비우는 순간 적재 중이던 조회는
 * {@code clear()} 에 잡히지 않아, 재집계 커밋 전에 시작한 조회가 그 뒤에 끝나면 새 시간대·옛 활동점수 엔트리로
 * 최대 60초(TTL) 남는다 — 어긋남은 활동점수 가중치 몫뿐이고, 같은 목록 요청이 그 몇십 ms 안에 겹쳐야 해 드물다(그
 * 엔트리를 재생성이 받으면 서버 HTML 은 다음 정각에 바로잡힌다). 기동 직후 실행은 재집계만 한다 — 기동 리스너는
 * readiness 전에 동기로 돌아, 외부 HTTP 왕복이 배포 직후 준비 신호를 늦춘다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.club.metric", name = "enabled", havingValue = "true")
public class ClubMetricRefreshJob {

    /** 정각 재생성 대상 — 추천순 기본 목록을 서버 HTML 에 담는 동아리 탐색 페이지. */
    private static final String CLUB_LIST_PAGE_PATH = "/clubs";

    private final ClubMetricService clubMetricService;
    private final ObjectProvider<CacheManager> cacheManagerProvider;
    private final FrontendRevalidator frontendRevalidator;

    @EventListener(ApplicationReadyEvent.class)
    public void refreshOnStartup() {
        refreshMetrics();
    }

    // 메서드 이름 refresh 는 ClubMetricScheduleRegistrationTest 가 크론 등록 대상으로 확인한다.
    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    public void refresh() {
        boolean metricsRefreshed = refreshMetrics();
        evictClubSearchCache();
        if (metricsRefreshed) {
            frontendRevalidator.revalidate(CLUB_LIST_PAGE_PATH);
        } else {
            log.warn("ClubMetricRefreshJob: {} 재생성 요청 건너뜀 — 재집계 실패(DB 장애일 수 있음), 직전 페이지는 1시간 주기 만료로 유지·갱신",
                    CLUB_LIST_PAGE_PATH);
        }
    }

    private boolean refreshMetrics() {
        try {
            clubMetricService.refreshAll();
            log.info("ClubMetricRefreshJob: 동아리 활동 지표 재집계 완료");
            return true;
        } catch (Exception refreshError) {
            log.error("ClubMetricRefreshJob: 재집계 실패 — 추천 정렬은 기존/0 점수로 동작", refreshError);
            return false;
        }
    }

    // 캐시 설정이 꺼진 환경(duing.public-api-cache.enabled=false — 테스트 기본)에는 캐시 매니저가 없다.
    private void evictClubSearchCache() {
        try {
            CacheManager cacheManager = cacheManagerProvider.getIfAvailable();
            Cache clubSearchCache = cacheManager == null
                    ? null
                    : cacheManager.getCache(PublicApiCacheConfig.CLUB_SEARCH_CACHE);
            if (clubSearchCache != null) {
                clubSearchCache.clear();
            }
        } catch (RuntimeException evictError) {
            log.warn("ClubMetricRefreshJob: 공개 동아리 목록 캐시 비우기 실패 — reason={}",
                    evictError.getClass().getSimpleName());
        }
    }
}
