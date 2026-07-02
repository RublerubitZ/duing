package com.duing.domain.facility.scheduler;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facility.service.FacilitySyncService;
import java.time.Clock;
import java.time.YearMonth;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 시설 크롤 스케줄러. 예약(10분)·시설목록(1일 04:00) 잡을 실행한다. AtomicBoolean.compareAndSet 으로
 * in-JVM 중복 실행을 막는다(이전 사이클 진행 중이면 skip). 멀티 인스턴스 크로스 락은 향후 과제(§10).
 * 예약 잡은 각 월을 {@link FacilityCrawlService#refreshMonthLocked} 로 monthLocks 락 아래 강제 수집한다 —
 * 온디맨드(ensureFresh) 와 같은 락을 타므로 스케줄러↔온디맨드가 같은 월의 delete+insert·메타 first-insert 를 경합하지 않는다.
 * 구조화 로그·Sentry breadcrumb 는 FacilityCrawlService 가 담당한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "duing.facility.crawler", name = "enabled", havingValue = "true")
public class FacilityCrawlScheduler {

    private final FacilityCrawlService crawlService;
    private final FacilitySyncService syncService;
    private final Clock clock;

    private final AtomicBoolean reservationRunning = new AtomicBoolean(false);
    private final AtomicBoolean syncRunning = new AtomicBoolean(false);

    @Scheduled(cron = "0 */10 * * * *", zone = "Asia/Seoul")
    public void runReservationCrawl() {
        if (!reservationRunning.compareAndSet(false, true)) {
            log.info("Facility Crawl skip: 이전 예약 수집 사이클이 아직 진행 중");
            return;
        }
        try {
            YearMonth current = YearMonth.now(clock);
            YearMonth next = current.plusMonths(1);
            crawlService.refreshMonthLocked(current, CrawlSource.SCHEDULER);
            crawlService.refreshMonthLocked(next, CrawlSource.SCHEDULER);
        } finally {
            reservationRunning.set(false);
        }
    }

    @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
    public void runFacilitySync() {
        if (!syncRunning.compareAndSet(false, true)) {
            log.info("Facility Sync skip: 이전 시설목록 동기화가 아직 진행 중");
            return;
        }
        try {
            syncService.sync();
        } finally {
            syncRunning.set(false);
        }
    }
}
