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
import java.util.concurrent.Semaphore;
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
    private static final int ON_DEMAND_MAX_CONCURRENT = 3;

    // 월별 single-flight 락. 키는 Task 17 의 ±12개월 조회 범위로 제한되므로 사실상 소수(최대 ~25)로 유지된다.
    private final ConcurrentHashMap<YearMonth, ReentrantLock> monthLocks = new ConcurrentHashMap<>();
    // 월별 최근 수집 시도 완료(성공·실패 불문) 시각 — 온디맨드 실패 쿨다운 판정용.
    // 시작이 아니라 완료 시점에 찍는다: 시작 시점 스탬프는 크롤이 쿨다운(30s)보다 오래 걸리면 쿨다운을 무력화한다(장애 시 연속 재크롤).
    private final ConcurrentHashMap<YearMonth, LocalDateTime> lastAttemptAt = new ConcurrentHashMap<>();
    // 온디맨드(공개 GET) 동시 크롤 전역 상한 — 월 순회 남용/업스트림 장애 시 요청 스레드 폭주 방지.
    private final Semaphore onDemandSlots = new Semaphore(ON_DEMAND_MAX_CONCURRENT);

    /** 스케줄러용: 해당 월을 monthLocks 로 직렬화한 채 강제 수집한다(온디맨드와 같은 락 → 경합 제거). */
    public CrawlSummary refreshMonthLocked(YearMonth yearMonth, CrawlSource source) {
        ReentrantLock lock = monthLocks.computeIfAbsent(yearMonth, key -> new ReentrantLock());
        lock.lock();
        try {
            return crawlAndReplace(List.of(yearMonth), source);
        } finally {
            lastAttemptAt.put(yearMonth, LocalDateTime.now(clock)); // 완료 시점 스탬프(쿨다운 기준)
            lock.unlock();
        }
    }

    /**
     * 온디맨드 조회 신선도 보장(§5.5). 신선하면 CACHE, 만료/미캐시면 그 월을 전 시설 fetch·교체 후
     * LIVE_FETCH(성공)/STALE_CACHE(라이브 실패, 옛 캐시 또는 콜드)를 반환한다.
     * 공개 GET 이 요청 스레드를 무한정 점유하지 않도록 두 단계로 유입을 제한한다(경합/폭주 시 STALE_CACHE 즉시 반환,
     * 대기 없음): (1) 월별 락은 {@code tryLock()} — 같은 월을 다른 요청이 이미 갱신 중이면 대기하지 않고 반환.
     * (2) 전역 {@link #onDemandSlots} 세마포어 — 월이 달라도 동시 온디맨드 크롤은 {@link #ON_DEMAND_MAX_CONCURRENT}개로 상한.
     */
    public DataSource ensureFresh(YearMonth yearMonth) {
        if (isFresh(yearMonth)) {
            return DataSource.CACHE;
        }
        ReentrantLock lock = monthLocks.computeIfAbsent(yearMonth, key -> new ReentrantLock());
        if (!lock.tryLock()) {
            // 같은 월을 다른 요청이 이미 갱신 중 — 요청 스레드를 붙잡지 않고 캐시(스테일) 즉시 반환.
            return DataSource.STALE_CACHE;
        }
        try {
            if (isFresh(yearMonth)) {
                return DataSource.CACHE; // 더블체크: 대기 중 다른 스레드가 채웠다면 fetch 생략
            }
            if (withinCooldown(yearMonth)) {
                // 최근 수집 시도(실패 포함) 후 쿨다운 내 — 학교 서버 연쇄 재요청·스레드 점유 폭주 방지(STALE_CACHE 서빙).
                return DataSource.STALE_CACHE;
            }
            if (!onDemandSlots.tryAcquire()) {
                // 온디맨드 동시 크롤 상한 초과(월 순회 남용/장애 시 폭주 방지) — 스테일 즉시 반환.
                return DataSource.STALE_CACHE;
            }
            try {
                CrawlSummary summary = crawlAndReplace(List.of(yearMonth), CrawlSource.ON_DEMAND);
                return summary.succeededRooms() > 0 ? DataSource.LIVE_FETCH : DataSource.STALE_CACHE;
            } finally {
                lastAttemptAt.put(yearMonth, LocalDateTime.now(clock)); // 완료 시점 스탬프(쿨다운 기준)
                onDemandSlots.release();
            }
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
                .map(snapshot -> snapshot.getFetchStatus() == FetchStatus.SUCCESS
                        && Duration.between(snapshot.getCrawledAt(), LocalDateTime.now(clock))
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

        // 온디맨드(공개 GET)는 FE 15초 타임아웃 안에 응답해야 하므로 전체 데드라인을 건다.
        // 초과 시 남은 룸은 시도 자체를 생략(스킵)하고 기존 스냅샷을 그대로 서빙한다(fail-safe 불변).
        boolean onDemand = source == CrawlSource.ON_DEMAND;
        long deadlineNanos = startNanos + Duration.ofSeconds(properties.onDemandDeadlineSeconds()).toNanos();
        boolean deadlineExceeded = false;
        int processedRooms = 0;

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
            // 데드라인 판정은 룸 간 sleep 뒤에 한다 — sleep 중 데드라인을 넘긴 채 다음 룸 fetch 를 시작하지 않도록.
            if (onDemand && System.nanoTime() > deadlineNanos) {
                deadlineExceeded = true;
                log.warn("온디맨드 크롤 데드라인 초과 — 남은 룸 수집 중단(스테일 서빙)");
                break;
            }

            Map<YearMonth, List<ParsedReservation>> fetchedByMonth = new LinkedHashMap<>();
            boolean roomFailed = false;
            for (YearMonth month : months) {
                try {
                    JsonNode body = onDemand
                            ? client.fetchReservationsOnDemand(facility.getRoomSeq(), month)
                            : client.fetchReservations(facility.getRoomSeq(), month);
                    List<ParsedReservation> parsed = reservationParser.parse(body, month);
                    if (body.size() > 0 && parsed.isEmpty()) {
                        // 200 + 비어있지 않은 배열인데 전원소 파싱 실패 — 학교 스키마 드리프트로 판단, 빈 스냅샷 교체(데이터 소실) 대신 룸 실패 처리(§1 fail-safe).
                        throw new FacilityClientException.FacilityBadResponseException(
                                "시설 예약 응답 스키마 불일치 의심: 원소 " + body.size() + "건 전부 파싱 불가");
                    }
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
            processedRooms++;
        }

        // 데드라인 스킵 룸은 시도 자체가 없었으므로 failedRooms 로 집계하지 않되,
        // 스킵이 있었던 달을 SUCCESS(신선)로 기록하면 안 된다 — anyFailure 를 세워 PARTIAL(stale=true)로 남겨 재시도되게 한다.
        int deadlineSkippedRooms = deadlineExceeded ? facilities.size() - processedRooms : 0;
        if (deadlineSkippedRooms > 0) {
            lastError = "온디맨드 데드라인 초과";
            for (YearMonth month : months) {
                anyFailure.put(month, true);
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
        // 데드라인 스킵 룸은 성공도 실패도 아니므로 성공 수에서 제외한다 — 스킵을 성공으로 오집계하면
        // succeededRooms>0 기준(LIVE_FETCH 판정)과 SUCCESS 오기록으로 스테일이 신선으로 둔갑한다.
        int succeededRoomCount = facilities.size() - failedRooms.size() - deadlineSkippedRooms;
        FetchStatus overall;
        if (facilities.isEmpty()) {
            overall = FetchStatus.FAILED; // 활성 시설이 없으면 수집 대상이 없음(콜드/오설정)
        } else if (failedRooms.isEmpty() && deadlineSkippedRooms == 0) {
            overall = FetchStatus.SUCCESS;
        } else if (succeededRoomCount <= 0) {
            overall = FetchStatus.FAILED;
        } else {
            overall = FetchStatus.PARTIAL;
        }
        CrawlSummary summary = new CrawlSummary(overall, facilities.size(), succeededRoomCount,
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
        // 심각도는 상태 기준 — 데드라인 스킵 PARTIAL 은 failedRooms 가 비어도 저하 상태이므로 WARN 으로 남긴다.
        if (summary.status() == FetchStatus.SUCCESS) {
            log.info(base);
            Sentry.addBreadcrumb(base);
        } else {
            String degraded = summary.failedRooms().isEmpty()
                    ? base
                    : base + " failedRooms=" + summary.failedRooms();
            log.warn(degraded);
            Sentry.addBreadcrumb(degraded);
        }
    }
}
