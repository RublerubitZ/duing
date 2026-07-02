package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
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
import com.fasterxml.jackson.databind.node.ArrayNode;
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
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
    @DisplayName("200 에 비어있지 않은 배열이 왔지만 전 원소가 파싱 불가면(스키마 드리프트) 빈 스냅샷으로 교체하지 않고 룸 실패로 처리한다")
    void schemaDriftDoesNotReplaceWithEmptySnapshot() {
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        // 학교가 필드명을 바꾼 상황: 원소는 2건 있지만 기존 파서 기준으로는 전부 파싱 불가.
        ArrayNode driftedBody = objectMapper.createArrayNode();
        driftedBody.add(objectMapper.createObjectNode().put("renamed_seq", "18134").put("renamed_time", "19:00~20:00"));
        driftedBody.add(objectMapper.createObjectNode().put("renamed_seq", "18135").put("renamed_time", "20:00~21:00"));
        when(client.fetchReservations(anyInt(), eq(july))).thenReturn(driftedBody);
        when(reservationParser.parse(any(), eq(july))).thenReturn(List.of());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        // 기존 스냅샷을 빈 데이터로 덮어쓰지 않고(§1 fail-safe) 실패 메타만 남긴다.
        verify(snapshotWriter, never()).replaceReservations(any(), any(), any(), any());
        verify(snapshotWriter, never()).recordSuccessfulMeta(any(), any(), any(), any(), any());
        verify(snapshotWriter, times(1)).recordFailureMeta(eq(july), any(), any());
        assertThat(summary.failedRooms()).containsExactly(4);
        assertThat(summary.status()).isEqualTo(FetchStatus.FAILED);
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
    @DisplayName("fetch 는 성공했지만 스냅샷 쓰기가 실패하면 그 달을 성공으로 집계하지 않고 실패 메타로 기록한다(C1)")
    void writeFailureIsNotCountedAsSuccess() {
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(client.fetchReservations(anyInt(), eq(july))).thenReturn(objectMapper.createArrayNode());
        when(reservationParser.parse(any(), eq(july))).thenReturn(List.of());
        doThrow(new org.springframework.dao.DataIntegrityViolationException("schedule_seq 충돌"))
                .when(snapshotWriter).replaceReservations(any(), any(), any(), any());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        // 쓰기 실패 → 성공 메타 기록 금지, 실패 메타로 crawled_at 보존
        verify(snapshotWriter, never()).recordSuccessfulMeta(any(), any(), any(), any(), any());
        verify(snapshotWriter, times(1)).recordFailureMeta(eq(july), any(), any());
        assertThat(summary.failedRooms()).containsExactly(4);
        assertThat(summary.status()).isEqualTo(FetchStatus.FAILED);
    }

    @Test
    @DisplayName("활성 시설이 하나도 없으면 크롤 결과는 FAILED 다(C2)")
    void emptyFacilitiesIsFailed() {
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        assertThat(summary.status()).isEqualTo(FetchStatus.FAILED);
        assertThat(summary.totalRooms()).isZero();
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
    @DisplayName("같은 월을 갱신 중인 요청이 있으면 두 번째 요청은 비블로킹(tryLock)이라 첫 크롤 완료를 기다리지 않고 STALE_CACHE 를 즉시 반환하고, 학교 fetch 는 1회로 수렴한다")
    void concurrentMissesCollapseToSingleFetch() throws Exception {
        // 타이밍(sleep)에 의존하지 않도록 래치로 순서를 결정론적으로 강제한다:
        // 첫 스레드가 월별 락을 쥔 채 크롤에 진입한 뒤에야 둘째 스레드를 실행해 tryLock 실패를 확정한다.
        YearMonth current = YearMonth.now(clock);
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(snapshotRepository.findByYearMonth(current)).thenReturn(Optional.empty());

        AtomicInteger fetchCount = new AtomicInteger();
        AtomicBoolean firstCrawlFinished = new AtomicBoolean(false);
        AtomicReference<Boolean> firstDoneWhenSecondReturned = new AtomicReference<>();
        CountDownLatch firstHoldsLock = new CountDownLatch(1);
        CountDownLatch secondReturned = new CountDownLatch(1);
        when(client.fetchReservations(anyInt(), eq(current))).thenAnswer(invocation -> {
            fetchCount.incrementAndGet();
            firstHoldsLock.countDown();                  // 첫 스레드가 월별 락을 쥔 채 크롤 진입을 알림
            secondReturned.await(3, TimeUnit.SECONDS);   // 둘째가 결과를 확정할 때까지 락을 계속 보유
            return objectMapper.createArrayNode();
        });
        when(reservationParser.parse(any(), eq(current))).thenReturn(List.of());
        doAnswer(invocation -> {
            firstCrawlFinished.set(true); // 크롤 종료(락 해제 직전) 표식 — 둘째가 이 시점 이후에 반환하면 블로킹 회귀다
            return null;
        }).when(snapshotWriter).recordSuccessfulMeta(eq(current), any(), any(), any(), any());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<DataSource> first = pool.submit(() -> service.ensureFresh(current));
        assertThat(firstHoldsLock.await(3, TimeUnit.SECONDS)).isTrue(); // 첫 스레드가 락 획득+크롤 진입할 때까지 대기
        Future<DataSource> second = pool.submit(() -> {
            DataSource result = service.ensureFresh(current); // 첫 스레드가 락 보유 중 → tryLock 실패
            firstDoneWhenSecondReturned.set(firstCrawlFinished.get()); // 반환 시점에 첫 크롤이 아직 안 끝났음
            secondReturned.countDown();                       // 이제 첫 스레드가 크롤을 마치도록 해제
            return result;
        });

        DataSource secondResult = second.get(3, TimeUnit.SECONDS);
        DataSource firstResult = first.get(3, TimeUnit.SECONDS);
        pool.shutdown();
        assertThat(pool.awaitTermination(5, TimeUnit.SECONDS)).isTrue();

        assertThat(fetchCount.get()).isEqualTo(1); // 동시 미스가 fetch 1회로 수렴(둘째는 재크롤하지 않음)
        assertThat(firstResult).isEqualTo(DataSource.LIVE_FETCH); // 락을 얻은 쪽은 실제 수집 성공
        assertThat(secondResult).isEqualTo(DataSource.STALE_CACHE); // tryLock 실패 → 대기 없이 스테일
        // 둘째가 첫 크롤 완료 전에 반환했음을 증명(블로킹 lock() 이면 완료 후에야 반환했을 것).
        assertThat(firstDoneWhenSecondReturned.get()).isFalse();
    }

    @Test
    @DisplayName("PARTIAL 스냅샷은 crawled_at 이 최근이어도 신선 취급하지 않고(isFresh=false) 재수집을 시도한다")
    void partialSnapshotIsNotTreatedAsFresh() {
        YearMonth current = YearMonth.now(clock);
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        FacilityMonthSnapshot partial = FacilityMonthSnapshot.create(
                current, LocalDateTime.now(clock), CrawlSource.SCHEDULER, FetchStatus.PARTIAL, "일부 룸 실패");
        when(snapshotRepository.findByYearMonth(current)).thenReturn(Optional.of(partial));
        when(client.fetchReservations(anyInt(), eq(current))).thenReturn(objectMapper.createArrayNode());
        when(reservationParser.parse(any(), eq(current))).thenReturn(List.of());

        DataSource result = service.ensureFresh(current);

        // CACHE 로 단락되지 않고 실제 재수집을 시도했음을 fetch 호출로 증명한다.
        verify(client, times(1)).fetchReservations(anyInt(), eq(current));
        // 단일 스레드·전 룸 성공 스텁이라 재수집은 결정적으로 성공(succeededRooms==1) → LIVE_FETCH.
        // STALE_CACHE 를 허용하면 재수집 회귀(CACHE 단락 등)를 놓칠 수 있어 정확히 단언한다.
        assertThat(result).isEqualTo(DataSource.LIVE_FETCH);
    }

    @Test
    @DisplayName("실패한 온디맨드 수집 직후 재요청은 쿨다운 내라 재수집 없이 STALE_CACHE 를 반환한다")
    void failedAttemptIsCooledDownBeforeRetry() {
        YearMonth current = YearMonth.now(clock);
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(snapshotRepository.findByYearMonth(current)).thenReturn(Optional.empty());
        when(client.fetchReservations(anyInt(), eq(current))).thenThrow(new FacilityFetchException("5xx"));

        assertThat(service.ensureFresh(current)).isEqualTo(DataSource.STALE_CACHE);
        verify(client, times(1)).fetchReservations(anyInt(), eq(current));

        assertThat(service.ensureFresh(current)).isEqualTo(DataSource.STALE_CACHE);
        verify(client, times(1)).fetchReservations(anyInt(), eq(current)); // 쿨다운 내 재요청 — 추가 fetch 없음
    }
}
