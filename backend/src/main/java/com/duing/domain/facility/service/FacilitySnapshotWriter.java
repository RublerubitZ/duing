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
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 예약 차등 반영과 월 메타 upsert 의 트랜잭션 경계. 오케스트레이터에서 분리해 프록시 self-invocation 을 피한다. */
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
     * 자기 자신과 unique 충돌하지 않게 한다.
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

        List<Long> removedRowIds = storedByScheduleSeq.values().stream()
                .map(FacilityReservation::getId)
                .filter(rowId -> !reconciledRowIds.contains(rowId))
                .toList();
        if (!removedRowIds.isEmpty()) {
            reservationRepository.deleteByIdIn(removedRowIds);
        }
        if (!toInsert.isEmpty()) {
            reservationRepository.saveAll(toInsert);
        }
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
