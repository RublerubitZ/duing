package com.duing.domain.facility.scheduler;

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
import java.time.Instant;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 시설 크롤 스케줄러. 예약(10분)·시설목록(1일 04:00) 잡을 실행하고, 기동(ApplicationReadyEvent) 시
 * 시설 목록이 비어 있으면 콜드 스타트 동기화를 1회 수행한다(§5.1). AtomicBoolean.compareAndSet 으로
 * in-JVM 중복 실행을 막는다(이전 사이클 진행 중이면 skip). 멀티 인스턴스 크로스 락은 향후 과제(§10).
 * 예약 잡은 각 월을 {@link FacilityCrawlService#refreshMonthLocked} 로 monthLocks 락 아래 강제 수집한다 —
 * 온디맨드(ensureFresh) 와 같은 락을 타므로 스케줄러↔온디맨드가 같은 월의 차등 반영·메타 first-insert 를 경합하지 않는다.
 * 구조화 로그·Sentry breadcrumb 는 FacilityCrawlService 가 담당한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "duing.facility.crawler", name = "enabled", havingValue = "true")
public class FacilityCrawlScheduler {

    private final FacilityCrawlService crawlService;
    private final FacilitySyncService syncService;
    private final FacilityRepository facilityRepository;
    private final Clock clock;
    private final JobRunRecorder jobRunRecorder;

    private final AtomicBoolean reservationRunning = new AtomicBoolean(false);
    private final AtomicBoolean syncRunning = new AtomicBoolean(false);

    /** §5.1 콜드 스타트: 기동 시 시설 목록이 비어 있으면 1회 동기화한다(실패해도 기동은 계속, 04:00 잡이 재시도). */
    @EventListener(ApplicationReadyEvent.class)
    public void syncFacilitiesOnColdStart() {
        try {
            if (facilityRepository.count() == 0) {
                log.info("콜드 스타트 — 시설 목록 초기 동기화 실행");
                syncService.sync();
            }
        } catch (RuntimeException syncFailure) {
            log.warn("콜드 스타트 시설 동기화 실패(기동 계속, 다음 04:00 잡에서 재시도)", syncFailure);
        }
    }

    @Scheduled(cron = "0 */10 * * * *", zone = "Asia/Seoul")
    public void runReservationCrawl() {
        if (!reservationRunning.compareAndSet(false, true)) {
            log.info("Facility Crawl skip: 이전 예약 수집 사이클이 아직 진행 중");
            return;
        }
        Instant startedAt = Instant.now(clock);
        try {
            YearMonth current = YearMonth.now(clock);
            YearMonth next = current.plusMonths(1);
            CrawlSummary currentSummary = crawlService.refreshMonthLocked(current, CrawlSource.SCHEDULER);
            CrawlSummary nextSummary = crawlService.refreshMonthLocked(next, CrawlSource.SCHEDULER);
            recordReservationCrawl(startedAt, currentSummary, nextSummary);
        } catch (RuntimeException crawlFailure) {
            jobRunRecorder.record(MonitoredJob.FACILITY_RESERVATION_CRAWL, startedAt, JobRunOutcome.FAILED, 0, 0);
            throw crawlFailure;
        } finally {
            reservationRunning.set(false);
        }
    }

    /**
     * 총동연 홈 자동 작업 카드용 기록 — 결과는 두 달 상태로만 정한다(실패 룸 없이 PARTIAL 인 달도 있다: 일부 칸을 읽지 못한 달).
     * 결과 건수는 이번 달 성공 룸 수, 실패 건수는 두 달 실패 룸의 중복 없는 합(같은 룸이 두 달 모두 실패해도 한 곳).
     */
    private void recordReservationCrawl(Instant startedAt, CrawlSummary currentSummary, CrawlSummary nextSummary) {
        Set<Integer> failedRooms = new HashSet<>(currentSummary.failedRooms());
        failedRooms.addAll(nextSummary.failedRooms());
        jobRunRecorder.record(MonitoredJob.FACILITY_RESERVATION_CRAWL, startedAt,
                crawlOutcome(currentSummary.status(), nextSummary.status()),
                currentSummary.succeededRooms(), failedRooms.size());
    }

    private static JobRunOutcome crawlOutcome(FetchStatus currentStatus, FetchStatus nextStatus) {
        if (currentStatus == FetchStatus.FAILED && nextStatus == FetchStatus.FAILED) {
            return JobRunOutcome.FAILED;
        }
        if (currentStatus != FetchStatus.SUCCESS || nextStatus != FetchStatus.SUCCESS) {
            return JobRunOutcome.PARTIAL;
        }
        return JobRunOutcome.SUCCESS;
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
