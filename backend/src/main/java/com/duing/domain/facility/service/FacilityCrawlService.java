package com.duing.domain.facility.service;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.crawler.exception.FacilityClientException;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.Facility;
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
                    anySuccess.put(month, true);
                    reservationCount.merge(month, parsed.size(), Integer::sum);
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
            if (Boolean.TRUE.equals(anySuccess.get(month))) {
                FetchStatus status = Boolean.TRUE.equals(anyFailure.get(month)) ? FetchStatus.PARTIAL : FetchStatus.SUCCESS;
                snapshotWriter.recordSuccessfulMeta(month, status, crawledAt, source,
                        status == FetchStatus.PARTIAL ? lastError : null);
            } else {
                snapshotWriter.recordFailureMeta(month, source, lastError);
            }
        }

        int totalReservations = reservationCount.values().stream().mapToInt(Integer::intValue).sum();
        FetchStatus overall;
        if (failedRooms.isEmpty()) {
            overall = FetchStatus.SUCCESS;
        } else if (failedRooms.size() >= facilities.size() && !facilities.isEmpty()) {
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
