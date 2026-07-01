package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityFetchException;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.parser.ReservationParser;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.dto.query.CrawlSummary;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FacilityCrawlServiceTest {

    @Mock FacilityRepository facilityRepository;
    @Mock FacilityMonthSnapshotRepository snapshotRepository;
    @Mock SchoolFacilityClient client;
    @Mock ReservationParser reservationParser;
    @Mock FacilitySnapshotWriter snapshotWriter;

    FacilityCrawlService service;
    final Clock clock = Clock.fixed(Instant.parse("2026-07-01T00:00:00Z"), ZoneId.of("Asia/Seoul"));
    final ObjectMapper objectMapper = new ObjectMapper();
    final YearMonth july = YearMonth.of(2026, 7);

    private FacilityCrawlerProperties props() {
        return new FacilityCrawlerProperties("http://x", "/room/detail", "/room/data/list",
                "UA", 500, 500, 4, 1, 1, false);
    }

    @BeforeEach
    void setUp() {
        service = new FacilityCrawlService(facilityRepository, snapshotRepository, client,
                reservationParser, snapshotWriter, props(), clock);
    }

    @Test
    @DisplayName("HTTP 200 빈 배열은 빈 스냅샷으로 교체하고 월 메타를 SUCCESS 로 기록한다")
    void emptyArrayReplacesWithEmpty() {
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(client.fetchReservations(anyInt(), eq(july))).thenReturn(objectMapper.createArrayNode());
        when(reservationParser.parse(any(), eq(july))).thenReturn(List.of());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        verify(snapshotWriter, times(1)).replaceReservations(any(), any(), any(), any());
        verify(snapshotWriter, times(1)).recordSuccessfulMeta(eq(july), eq(FetchStatus.SUCCESS), any(), any(), any());
        assertThat(summary.failedRooms()).isEmpty();
    }

    @Test
    @DisplayName("fetch 실패(5xx 소진)는 스냅샷을 교체하지 않고 월 메타를 실패로 기록한다(기존 유지)")
    void fetchFailurePreservesSnapshot() {
        Facility facility = Facility.create(6, "공동연습실(2)", "2106", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(client.fetchReservations(anyInt(), eq(july))).thenThrow(new FacilityFetchException("5xx"));

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        verify(snapshotWriter, never()).replaceReservations(any(), any(), any(), any());
        verify(snapshotWriter, times(1)).recordFailureMeta(eq(july), any(), any());
        assertThat(summary.failedRooms()).containsExactly(6);
        assertThat(summary.status()).isEqualTo(FetchStatus.FAILED);
    }

    @Test
    @DisplayName("일부 룸만 실패하면 성공 룸은 교체되고 월 메타는 PARTIAL 로 기록된다(룸 격리)")
    void partialFailureIsolatesRooms() {
        Facility ok = Facility.create(4, "공동연습실(1)", "2105", 0);
        Facility bad = Facility.create(6, "공동연습실(2)", "2106", 1);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(ok, bad));
        when(client.fetchReservations(eq(4), eq(july))).thenReturn(objectMapper.createArrayNode());
        when(client.fetchReservations(eq(6), eq(july))).thenThrow(new FacilityFetchException("timeout"));
        when(reservationParser.parse(any(), eq(july))).thenReturn(List.of());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        verify(snapshotWriter, times(1)).replaceReservations(any(), any(), any(), any()); // ok 만
        verify(snapshotWriter, times(1)).recordSuccessfulMeta(eq(july), eq(FetchStatus.PARTIAL), any(), any(), any());
        assertThat(summary.failedRooms()).containsExactly(6);
        assertThat(summary.succeededRooms()).isEqualTo(1);
        assertThat(summary.status()).isEqualTo(FetchStatus.PARTIAL);
    }

    @Test
    @DisplayName("신선한 스냅샷(현재월·10분 TTL 이내)이 있으면 fetch 없이 CACHE 를 반환한다")
    void freshSnapshotServesCache() {
        YearMonth current = YearMonth.now(clock);
        FacilityMonthSnapshot fresh = FacilityMonthSnapshot.create(
                current, LocalDateTime.now(clock), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null);
        when(snapshotRepository.findByYearMonth(current)).thenReturn(Optional.of(fresh));

        assertThat(service.ensureFresh(current)).isEqualTo(DataSource.CACHE);
        verify(facilityRepository, never()).findByArchivedAtIsNullOrderBySortOrderAsc();
    }

    @Test
    @DisplayName("동시 미스 2건은 single-flight 락으로 학교 fetch 1회로 수렴한다")
    void concurrentMissesCollapseToSingleFetch() throws InterruptedException {
        YearMonth current = YearMonth.now(clock);
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));

        AtomicReference<FacilityMonthSnapshot> stored = new AtomicReference<>(null);
        when(snapshotRepository.findByYearMonth(current))
                .thenAnswer(invocation -> Optional.ofNullable(stored.get()));

        AtomicInteger fetchCount = new AtomicInteger();
        when(client.fetchReservations(anyInt(), eq(current))).thenAnswer(invocation -> {
            fetchCount.incrementAndGet();
            Thread.sleep(200); // 첫 스레드가 락을 쥐고 있는 동안 둘째가 대기하도록
            return objectMapper.createArrayNode();
        });
        when(reservationParser.parse(any(), eq(current))).thenReturn(List.of());
        // 성공 메타 기록 시 스냅샷이 신선해지도록 상태를 채운다 → 둘째 스레드의 더블체크가 CACHE 로 빠진다.
        doAnswer(invocation -> {
            stored.set(FacilityMonthSnapshot.create(current, LocalDateTime.now(clock),
                    CrawlSource.ON_DEMAND, FetchStatus.SUCCESS, null));
            return null;
        }).when(snapshotWriter).recordSuccessfulMeta(eq(current), any(), any(), any(), any());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        Runnable task = () -> {
            ready.countDown();
            try {
                go.await();
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            service.ensureFresh(current);
        };
        pool.submit(task);
        pool.submit(task);
        ready.await();
        go.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(5, TimeUnit.SECONDS)).isTrue();

        assertThat(fetchCount.get()).isEqualTo(1); // 동시 미스가 fetch 1회로 수렴
    }
}
