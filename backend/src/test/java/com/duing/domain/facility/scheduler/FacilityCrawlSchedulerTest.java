package com.duing.domain.facility.scheduler;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facility.service.FacilitySyncService;
import com.duing.domain.facility.service.dto.query.CrawlSummary;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FacilityCrawlSchedulerTest {

    @Mock FacilityCrawlService crawlService;
    @Mock FacilitySyncService syncService;

    final Clock clock = Clock.fixed(Instant.parse("2026-07-15T05:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Test
    @DisplayName("예약 잡은 현재월과 다음월을 각각 락으로 직렬화해 SCHEDULER 소스로 강제 수집한다")
    void reservationJobCrawlsCurrentAndNextMonth() {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, clock);
        when(crawlService.refreshMonthLocked(any(), any())).thenReturn(
                new CrawlSummary(FetchStatus.SUCCESS, 10, 10, 100, List.of(), Duration.ofSeconds(1)));

        scheduler.runReservationCrawl();

        verify(crawlService).refreshMonthLocked(eq(java.time.YearMonth.of(2026, 7)), eq(CrawlSource.SCHEDULER));
        verify(crawlService).refreshMonthLocked(eq(java.time.YearMonth.of(2026, 8)), eq(CrawlSource.SCHEDULER));
    }

    @Test
    @DisplayName("이전 사이클이 진행 중이면 이번 tick 은 skip 되어 크롤이 1회 사이클(현재+다음월)만 실행된다")
    void overlappingTickIsSkipped() throws InterruptedException {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, clock);
        CountDownLatch inside = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(crawlService.refreshMonthLocked(any(), any())).thenAnswer(invocation -> {
            inside.countDown();
            release.await(); // 첫 실행(현재월)을 붙잡아 두 번째 tick 과 겹치게 한다
            return new CrawlSummary(FetchStatus.SUCCESS, 1, 1, 0, List.of(), Duration.ofSeconds(1));
        });

        var pool = Executors.newSingleThreadExecutor();
        pool.submit(scheduler::runReservationCrawl); // 첫 tick — 락 점유
        inside.await();
        scheduler.runReservationCrawl();             // 둘째 tick — skip 되어야 함
        release.countDown();
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);

        verify(crawlService, times(2)).refreshMonthLocked(any(), any()); // 첫 tick 의 현재월+다음월만, 둘째 tick 은 skip
    }
}
