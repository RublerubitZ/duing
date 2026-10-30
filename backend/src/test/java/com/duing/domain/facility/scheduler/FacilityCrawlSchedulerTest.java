package com.duing.domain.facility.scheduler;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facility.service.FacilitySyncService;
import com.duing.domain.facility.service.dto.query.CrawlSummary;
import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.JobRunRecorder;
import com.duing.global.jobrun.MonitoredJob;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
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
    @Mock FacilityRepository facilityRepository;
    @Mock JobRunRecorder jobRunRecorder;

    final Clock clock = Clock.fixed(Instant.parse("2026-07-15T05:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Test
    @DisplayName("예약 잡은 현재월과 다음월을 각각 락으로 직렬화해 SCHEDULER 소스로 강제 수집한다")
    void reservationJobCrawlsCurrentAndNextMonth() {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder);
        when(crawlService.refreshMonthLocked(any(), any())).thenReturn(
                new CrawlSummary(FetchStatus.SUCCESS, 10, 10, 100, List.of(), Duration.ofSeconds(1)));

        scheduler.runReservationCrawl();

        verify(crawlService).refreshMonthLocked(eq(java.time.YearMonth.of(2026, 7)), eq(CrawlSource.SCHEDULER));
        verify(crawlService).refreshMonthLocked(eq(java.time.YearMonth.of(2026, 8)), eq(CrawlSource.SCHEDULER));
    }

    @Test
    @DisplayName("이전 사이클이 진행 중이면 이번 tick 은 skip 되어 크롤이 1회 사이클(현재+다음월)만 실행된다")
    void overlappingTickIsSkipped() throws InterruptedException {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder);
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
        verify(jobRunRecorder, times(1)).record(any(), any(), any(), anyInt(), anyInt()); // 둘째 tick 은 기록하지 않음
    }

    @Test
    @DisplayName("기동 시 시설 목록이 비어 있으면 콜드 스타트 동기화를 1회 실행한다")
    void coldStartSyncsWhenFacilityTableIsEmpty() {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder);
        when(facilityRepository.count()).thenReturn(0L);

        scheduler.syncFacilitiesOnColdStart();

        verify(syncService, times(1)).sync();
    }

    @Test
    @DisplayName("기동 시 시설 목록이 이미 있으면 콜드 스타트 동기화를 실행하지 않는다")
    void coldStartSkipsWhenFacilitiesAlreadyExist() {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder);
        when(facilityRepository.count()).thenReturn(3L);

        scheduler.syncFacilitiesOnColdStart();

        verify(syncService, never()).sync();
    }

    @Test
    @DisplayName("콜드 스타트 동기화가 실패해도 예외가 전파되지 않아 애플리케이션 기동이 계속된다")
    void coldStartSyncFailureDoesNotPropagate() {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder);
        when(facilityRepository.count()).thenReturn(0L);
        doThrow(new IllegalStateException("학교 응답 이상")).when(syncService).sync();

        assertThatCode(scheduler::syncFacilitiesOnColdStart).doesNotThrowAnyException();
    }

    private static final Instant STARTED_AT = Instant.parse("2026-07-15T05:00:00Z");

    private static CrawlSummary summary(FetchStatus status, int succeededRooms, List<Integer> failedRooms) {
        return new CrawlSummary(status, 10, succeededRooms, 100, failedRooms, Duration.ofSeconds(1));
    }

    private void givenMonths(CrawlSummary currentMonth, CrawlSummary nextMonth) {
        when(crawlService.refreshMonthLocked(eq(YearMonth.of(2026, 7)), eq(CrawlSource.SCHEDULER))).thenReturn(currentMonth);
        when(crawlService.refreshMonthLocked(eq(YearMonth.of(2026, 8)), eq(CrawlSource.SCHEDULER))).thenReturn(nextMonth);
    }

    @Test
    @DisplayName("두 달 모두 성공하면 성공과 이번 달 성공 시설 수를 기록한다")
    void recordsSuccessWhenBothMonthsSucceed() {
        givenMonths(summary(FetchStatus.SUCCESS, 10, List.of()), summary(FetchStatus.SUCCESS, 10, List.of()));

        new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder).runReservationCrawl();

        verify(jobRunRecorder).record(MonitoredJob.FACILITY_RESERVATION_CRAWL, STARTED_AT, JobRunOutcome.SUCCESS, 10, 0);
    }

    @Test
    @DisplayName("한 달이라도 일부 실패면 일부 실패이고, 같은 시설이 두 달 모두 실패해도 실패 시설은 한 곳으로 센다")
    void recordsPartialWithDistinctFailedRooms() {
        givenMonths(summary(FetchStatus.PARTIAL, 8, List.of(3, 5)), summary(FetchStatus.PARTIAL, 9, List.of(3)));

        new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder).runReservationCrawl();

        verify(jobRunRecorder).record(MonitoredJob.FACILITY_RESERVATION_CRAWL, STARTED_AT, JobRunOutcome.PARTIAL, 8, 2);
    }

    @Test
    @DisplayName("실패 시설 없이 일부 칸만 읽지 못한 달도 일부 실패다 — 결과는 상태로만 정한다")
    void recordsPartialEvenWithoutFailedRooms() {
        givenMonths(summary(FetchStatus.SUCCESS, 10, List.of()), summary(FetchStatus.PARTIAL, 10, List.of()));

        new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder).runReservationCrawl();

        verify(jobRunRecorder).record(MonitoredJob.FACILITY_RESERVATION_CRAWL, STARTED_AT, JobRunOutcome.PARTIAL, 10, 0);
    }

    @Test
    @DisplayName("두 달 모두 전체 실패면 실패를 기록한다")
    void recordsFailedWhenBothMonthsFail() {
        givenMonths(summary(FetchStatus.FAILED, 0, List.of(1, 2)), summary(FetchStatus.FAILED, 0, List.of(1, 2)));

        new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder).runReservationCrawl();

        verify(jobRunRecorder).record(MonitoredJob.FACILITY_RESERVATION_CRAWL, STARTED_AT, JobRunOutcome.FAILED, 0, 2);
    }

    @Test
    @DisplayName("수집 중 예외가 나면 실패를 기록하고 같은 예외를 그대로 내보낸다")
    void recordsFailureAndRethrowsSameException() {
        IllegalStateException crawlFailure = new IllegalStateException("주입된 수집 실패");
        when(crawlService.refreshMonthLocked(any(), any())).thenThrow(crawlFailure);
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, facilityRepository, clock, jobRunRecorder);

        assertThatThrownBy(scheduler::runReservationCrawl).isSameAs(crawlFailure);

        verify(jobRunRecorder).record(MonitoredJob.FACILITY_RESERVATION_CRAWL, STARTED_AT, JobRunOutcome.FAILED, 0, 0);
    }
}
