package com.duing.domain.facility.service;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.crawler.exception.FacilityClientException;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.parser.ReservationParser;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.dto.query.CrawlSummary;
import com.fasterxml.jackson.databind.JsonNode;
import io.sentry.Sentry;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 시설 예약 수집 오케스트레이션 + 원자적 스냅샷 교체(fail-safe) + 온디맨드 single-flight(Task 16).
 * fetch·파싱·검증은 트랜잭션 밖에서 하고 성공한 월만 {@link FacilitySnapshotWriter} 로 원자 교체한다.
 * 룸 실패는 격리되어 다른 룸에 영향이 없고, 실패한 (시설,월)은 기존 스냅샷을 유지한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FacilityCrawlService {

    private final FacilityRepository facilityRepository;
    private final FacilityMonthSnapshotRepository snapshotRepository;
    private final SchoolFacilityClient client;
    private final ReservationParser reservationParser;
    private final FacilitySnapshotWriter snapshotWriter;
    private final FacilityCrawlerProperties properties;
    private final Clock clock;

    private static final int CURRENT_NEXT_TTL_MINUTES = 10;
    private static final int OTHER_TTL_HOURS = 24;
    private static final int ON_DEMAND_COOLDOWN_SECONDS = 30;

    // 월별 single-flight 락. 키는 Task 17 의 ±12개월 조회 범위로 제한되므로 사실상 소수(최대 ~25)로 유지된다.
    private final ConcurrentHashMap<YearMonth, ReentrantLock> monthLocks = new ConcurrentHashMap<>();
    // 월별 최근 수집 시도(성공·실패 불문) 시각 — 온디맨드 실패 쿨다운 판정용.
    private final ConcurrentHashMap<YearMonth, LocalDateTime> lastAttemptAt = new ConcurrentHashMap<>();

    /** 스케줄러용: 해당 월을 monthLocks 로 직렬화한 채 강제 수집한다(온디맨드와 같은 락 → 경합 제거). */
    public CrawlSummary refreshMonthLocked(YearMonth yearMonth, CrawlSource source) {
        ReentrantLock lock = monthLocks.computeIfAbsent(yearMonth, key -> new ReentrantLock());
        lock.lock();
        try {
            lastAttemptAt.put(yearMonth, LocalDateTime.now(clock));
            return crawlAndReplace(List.of(yearMonth), source);
        } finally {
            lock.unlock();
        }
    }

    /**
     * 온디맨드 조회 신선도 보장(§5.5). 신선하면 CACHE, 만료/미캐시면 single-flight 락으로 그 월을
     * 전 시설 fetch·교체 후 LIVE_FETCH(성공)/STALE_CACHE(라이브 실패, 옛 캐시 또는 콜드)를 반환한다.
     */
    public DataSource ensureFresh(YearMonth yearMonth) {
        if (isFresh(yearMonth)) {
            return DataSource.CACHE;
        }
        ReentrantLock lock = monthLocks.computeIfAbsent(yearMonth, key -> new ReentrantLock());
        lock.lock();
        try {
            if (isFresh(yearMonth)) {
                return DataSource.CACHE; // 더블체크: 대기 중 다른 스레드가 채웠다면 fetch 생략
            }
            if (withinCooldown(yearMonth)) {
                // 최근 수집 시도(실패 포함) 후 쿨다운 내 — 학교 서버 연쇄 재요청·스레드 점유 폭주 방지(STALE_CACHE 서빙).
                return DataSource.STALE_CACHE;
            }
            lastAttemptAt.put(yearMonth, LocalDateTime.now(clock));
            CrawlSummary summary = crawlAndReplace(List.of(yearMonth), CrawlSource.ON_DEMAND);
            return summary.succeededRooms() > 0 ? DataSource.LIVE_FETCH : DataSource.STALE_CACHE;
        } finally {
            lock.unlock();
        }
    }

    private boolean withinCooldown(YearMonth yearMonth) {
        LocalDateTime attempted = lastAttemptAt.get(yearMonth);
        return attempted != null
                && Duration.between(attempted, LocalDateTime.now(clock)).compareTo(Duration.ofSeconds(ON_DEMAND_COOLDOWN_SECONDS)) < 0;
    }

    private boolean isFresh(YearMonth yearMonth) {
        return snapshotRepository.findByYearMonth(yearMonth)
                .map(snapshot -> Duration.between(snapshot.getCrawledAt(), LocalDateTime.now(clock))
                        .compareTo(ttl(yearMonth)) < 0)
                .orElse(false);
    }

    private Duration ttl(YearMonth yearMonth) {
        YearMonth current = YearMonth.now(clock);
        if (yearMonth.equals(current) || yearMonth.equals(current.plusMonths(1))) {
            return Duration.ofMinutes(CURRENT_NEXT_TTL_MINUTES);
        }
        return Duration.ofHours(OTHER_TTL_HOURS);
    }

    public CrawlSummary crawlAndReplace(List<YearMonth> months, CrawlSource source) {
        long startNanos = System.nanoTime();
        LocalDateTime crawledAt = LocalDateTime.now(clock);
        List<Facility> facilities = facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc();

        Map<YearMonth, Integer> reservationCount = new LinkedHashMap<>();
        Map<YearMonth, Boolean> anySuccess = new LinkedHashMap<>();
        Map<YearMonth, Boolean> anyFailure = new LinkedHashMap<>();
        for (YearMonth month : months) {
            reservationCount.put(month, 0);
            anySuccess.put(month, false);
            anyFailure.put(month, false);
        }
        List<Integer> failedRooms = new ArrayList<>();
        String lastError = null;

        boolean firstRoom = true;
        for (Facility facility : facilities) {
            if (Thread.currentThread().isInterrupted()) {
                log.warn("시설 수집 인터럽트 감지 — 남은 룸 수집 중단");
                break;
            }
            if (!firstRoom) {
                sleepBetweenRooms();
            }
            firstRoom = false;

            Map<YearMonth, List<ParsedReservation>> fetchedByMonth = new LinkedHashMap<>();
            boolean roomFailed = false;
            for (YearMonth month : months) {
                try {
                    JsonNode body = client.fetchReservations(facility.getRoomSeq(), month);
                    List<ParsedReservation> parsed = reservationParser.parse(body, month);
                    fetchedByMonth.put(month, parsed);
                } catch (FacilityClientException fetchFailure) {
                    roomFailed = true;
                    anyFailure.put(month, true);
                    lastError = summarize(fetchFailure);
                }
            }
            if (!fetchedByMonth.isEmpty()) {
                try {
                    snapshotWriter.replaceReservations(
                            facility.getId(), new ArrayList<>(fetchedByMonth.keySet()), fetchedByMonth, crawledAt);
                    // 영속 성공 후에만 성공으로 집계한다 — 쓰기 실패(유니크 충돌 등)를 성공으로 오집계해
                    // crawled_at 을 갱신(신선 처리)하고 옛 스냅샷을 최신인 양 서빙하는 것을 막는다(C1).
                    fetchedByMonth.forEach((month, reservations) -> {
                        anySuccess.put(month, true);
                        reservationCount.merge(month, reservations.size(), Integer::sum);
                    });
                } catch (RuntimeException replaceFailure) {
                    // schedule_seq unique 충돌 등 — fail-safe: 해당 시설 기존 스냅샷 유지, 다음 주기에 정합.
                    roomFailed = true;
                    fetchedByMonth.keySet().forEach(month -> anyFailure.put(month, true));
                    lastError = summarize(replaceFailure);
                    log.warn("시설 스냅샷 교체 실패(기존 유지): roomSeq={}", facility.getRoomSeq());
                }
            }
            if (roomFailed) {
                failedRooms.add(facility.getRoomSeq());
            }
        }

        for (YearMonth month : months) {
            try {
                if (Boolean.TRUE.equals(anySuccess.get(month))) {
                    FetchStatus status = Boolean.TRUE.equals(anyFailure.get(month)) ? FetchStatus.PARTIAL : FetchStatus.SUCCESS;
                    snapshotWriter.recordSuccessfulMeta(month, status, crawledAt, source, status == FetchStatus.PARTIAL ? lastError : null);
                } else {
                    snapshotWriter.recordFailureMeta(month, source, lastError);
                }
            } catch (RuntimeException metaFailure) {
                log.warn("월 메타 기록 실패(무시): yearMonth={}", month, metaFailure);
            }
        }

        int totalReservations = reservationCount.values().stream().mapToInt(Integer::intValue).sum();
        FetchStatus overall;
        if (facilities.isEmpty()) {
            overall = FetchStatus.FAILED; // 활성 시설이 없으면 수집 대상이 없음(콜드/오설정)
        } else if (failedRooms.isEmpty()) {
            overall = FetchStatus.SUCCESS;
        } else if (failedRooms.size() >= facilities.size()) {
            overall = FetchStatus.FAILED;
        } else {
            overall = FetchStatus.PARTIAL;
        }
        CrawlSummary summary = new CrawlSummary(overall, facilities.size(), facilities.size() - failedRooms.size(),
                totalReservations, failedRooms, Duration.ofNanos(System.nanoTime() - startNanos));
        logSummary(summary);
        return summary;
    }

    private void sleepBetweenRooms() {
        try {
            Thread.sleep(properties.roomDelayMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private String summarize(Throwable throwable) {
        // method/status 수준만 — PII·학교 민감정보 금지(예외 메시지는 status/code 수준으로 구성됨).
        return throwable.getClass().getSimpleName() + ": " + throwable.getMessage();
    }

    private void logSummary(CrawlSummary summary) {
        String base = String.format("Facility Crawl %s rooms=%d/%d reservations=%d duration=%.1fs",
                summary.status(), summary.succeededRooms(), summary.totalRooms(), summary.reservations(),
                summary.duration().toMillis() / 1000.0);
        if (summary.failedRooms().isEmpty()) {
            log.info(base);
            Sentry.addBreadcrumb(base);
        } else {
            String withFailed = base + " failedRooms=" + summary.failedRooms();
            log.warn(withFailed);
            Sentry.addBreadcrumb(withFailed);
        }
    }
}
