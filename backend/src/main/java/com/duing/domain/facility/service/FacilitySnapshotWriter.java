package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 예약 차등 반영과 월 메타 upsert 의 트랜잭션 경계. 오케스트레이터에서 분리해 프록시 self-invocation 을 피한다. */
@Slf4j
@Component
@RequiredArgsConstructor
public class FacilitySnapshotWriter {

    private final FacilityReservationRepository reservationRepository;
    private final FacilityMonthSnapshotRepository snapshotRepository;

    /**
     * 한 시설의 지정 월들을 크롤 결과와 일치시킨다(차등 반영). 저장 행과 크롤 결과를 학교 자연키인
     * schedule_seq 로 짝지어 신규만 INSERT, 값이 바뀐 행만 UPDATE, 학교에서 사라진 행만 DELETE 한다 —
     * 논리적으로 동일한 크롤(순서만 다른 응답 포함)은 어떤 쓰기 문장도 만들지 않는다.
     *
     * <p>{@code 200 + []} 는 빈 리스트로 들어와 그 시설·월의 행이 전부 삭제된다(취소된 예약 유령 방지).
     * schedule_seq unique 충돌 시 트랜잭션이 롤백되어 호출부가 fail-safe(기존 유지)로 처리한다.
     * DELETE 를 INSERT 보다 먼저 실행해, 한 트랜잭션에서 여러 월을 다룰 때 월 간 이동한 schedule_seq 가
     * 자기 자신과 unique 충돌하지 않게 한다. 반영 범위 밖(윈도우 밖 월·다른 시설)에 남은 같은 seq 행도
     * 같은 DELETE 에 실어 함께 지운다 — {@link #staleRowIdsOutsideScope} 참고.
     */
    @Transactional
    public void reconcileReservations(Long facilityId, List<YearMonth> months,
                                      Map<YearMonth, List<ParsedReservation>> fetchedByMonth, LocalDateTime crawledAt) {
        Map<Long, FacilityReservation> storedByScheduleSeq = new LinkedHashMap<>();
        for (FacilityReservation stored : reservationRepository.findByFacilityIdAndYearMonthIn(facilityId, months)) {
            storedByScheduleSeq.put(stored.getScheduleSeq(), stored);
        }

        Set<Long> reconciledRowIds = new HashSet<>();
        List<FacilityReservation> toInsert = new ArrayList<>();
        for (YearMonth yearMonth : months) {
            for (ParsedReservation crawled : fetchedByMonth.getOrDefault(yearMonth, List.of())) {
                FacilityReservation stored = storedByScheduleSeq.get(crawled.scheduleSeq());
                // 월이 다른 저장 행은 학교에서 예약이 다른 달로 옮겨진 경우다 — 제자리 갱신 대신 제거+신규로 처리한다.
                if (stored == null || !stored.getYearMonth().equals(yearMonth)) {
                    toInsert.add(FacilityReservation.create(
                            facilityId, crawled.scheduleSeq(), yearMonth, crawled.reservationDate(),
                            crawled.startTime(), crawled.endTime(), crawled.organizationName(),
                            crawled.reservedStartTime(), crawled.reservedEndTime(), crawledAt));
                    continue;
                }
                stored.updateCrawledDetails(crawled.reservationDate(), crawled.startTime(), crawled.endTime(),
                        crawled.organizationName(), crawled.reservedStartTime(), crawled.reservedEndTime(), crawledAt);
                reconciledRowIds.add(stored.getId());
            }
        }

        Set<Long> removedRowIds = new LinkedHashSet<>();
        for (FacilityReservation stored : storedByScheduleSeq.values()) {
            if (!reconciledRowIds.contains(stored.getId())) {
                removedRowIds.add(stored.getId());
            }
        }
        removedRowIds.addAll(staleRowIdsOutsideScope(facilityId, toInsert, removedRowIds));
        if (!removedRowIds.isEmpty()) {
            reservationRepository.deleteByIdIn(removedRowIds);
        }
        if (!toInsert.isEmpty()) {
            reservationRepository.saveAll(toInsert);
        }
    }

    /**
     * 이번 반영 범위(이 시설의 대상 월들) 밖에 같은 schedule_seq 로 남아 있는 행의 id — INSERT 전에 함께 지운다.
     *
     * <p>크롤은 당월·익월 윈도우만 reconcile 하므로, 윈도우 밖 과거 월에 남은 행이나 다른 시설로 옮겨간 예약의
     * 행은 위 diff 의 비교 대상에 아예 들어오지 않는다. 그대로 INSERT 하면 전역 UNIQUE(schedule_seq) 와
     * 충돌해 그 시설 트랜잭션이 롤백되고, fail-safe 라 조용히 다음 주기에도 같은 충돌이 반복된다 —
     * 수동 개입 전까지 그 시설의 수집·자동 확정이 영구히 멈춘다.
     *
     * <p>schedule_seq 는 학교 전역 자연키다. 크롤이 그 seq 를 (시설,월)로 내려준 순간 다른 위치의 같은 seq 행은
     * 정의상 예약이 옮겨간 뒤의 잔존물이므로, 윈도우 안 월 이동과 같은 규약(제거 + 신규)으로 해소한다.
     * 신규 INSERT 가 없는 주기(=대부분)에는 조회 자체를 하지 않는다.
     */
    private List<Long> staleRowIdsOutsideScope(Long facilityId, List<FacilityReservation> toInsert,
                                               Set<Long> removedRowIds) {
        if (toInsert.isEmpty()) {
            return List.of();
        }
        List<Long> insertScheduleSeqs = toInsert.stream().map(FacilityReservation::getScheduleSeq).toList();
        List<FacilityReservation> staleRows = reservationRepository.findByScheduleSeqIn(insertScheduleSeqs).stream()
                .filter(staleRow -> !removedRowIds.contains(staleRow.getId()))
                .toList();
        if (staleRows.isEmpty()) {
            return List.of();
        }
        log.warn("크롤 범위 밖 잔존 예약 제거(예약 이동으로 판단): facilityId={} scheduleSeqs={}",
                facilityId, staleRows.stream().map(FacilityReservation::getScheduleSeq).toList());
        return staleRows.stream().map(FacilityReservation::getId).toList();
    }

    /**
     * 성공/부분성공 월 메타 upsert — crawled_at(마지막 성공 시각)과 그 세대에 반영 성공한 시설 집합을 갱신한다.
     * 두 값은 반드시 같은 세대여야 하므로 한 트랜잭션에서 함께 쓴다(§5.3 세대 결박).
     */
    @Transactional
    public void recordSuccessfulMeta(YearMonth yearMonth, FetchStatus status, LocalDateTime crawledAt,
                                     CrawlSource source, String lastError, List<Long> syncedFacilityIds) {
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(yearMonth)
                .orElseGet(() -> snapshotRepository.save(
                        FacilityMonthSnapshot.create(yearMonth, crawledAt, source, status, lastError)));
        snapshot.recordSuccessful(crawledAt, source, status, lastError, syncedFacilityIds);
    }

    /**
     * 전체 실패 월 메타 — 기존 메타가 있으면 crawled_at 보존한 채 FAILED·last_error 만 기록.
     * 기존 메타가 없으면(콜드+실패) 메타를 만들지 않는다(crawled_at NOT NULL, 성공 시각 없음) → 조회 시 콜드=stale.
     */
    @Transactional
    public void recordFailureMeta(YearMonth yearMonth, CrawlSource source, String lastError) {
        snapshotRepository.findByYearMonth(yearMonth).ifPresent(snapshot -> snapshot.recordFailure(source, lastError));
    }
}
