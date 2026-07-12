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
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 원자적 스냅샷 교체와 월 메타 upsert 의 트랜잭션 경계. 오케스트레이터에서 분리해 프록시 self-invocation 을 피한다. */
@Component
@RequiredArgsConstructor
public class FacilitySnapshotWriter {

    private final FacilityReservationRepository reservationRepository;
    private final FacilityMonthSnapshotRepository snapshotRepository;

    /**
     * 한 시설의 지정 월들을 원자적으로 교체한다(delete → insert). {@code 200 + []} 는 빈 리스트로 들어와
     * 빈 스냅샷으로 교체된다(취소된 예약 유령 방지). schedule_seq unique 충돌 시 트랜잭션이 롤백되어
     * 호출부가 fail-safe(기존 유지)로 처리한다.
     */
    @Transactional
    public void replaceReservations(Long facilityId, List<YearMonth> months,
                                    Map<YearMonth, List<ParsedReservation>> fetchedByMonth, LocalDateTime crawledAt) {
        reservationRepository.deleteByFacilityIdAndYearMonthIn(facilityId, months);
        List<FacilityReservation> toInsert = new ArrayList<>();
        for (YearMonth yearMonth : months) {
            for (ParsedReservation reservation : fetchedByMonth.getOrDefault(yearMonth, List.of())) {
                toInsert.add(FacilityReservation.create(
                        facilityId, reservation.scheduleSeq(), yearMonth, reservation.reservationDate(),
                        reservation.startTime(), reservation.endTime(), reservation.organizationName(),
                        reservation.reservedStartTime(), reservation.reservedEndTime(), crawledAt));
            }
        }
        if (!toInsert.isEmpty()) {
            reservationRepository.saveAll(toInsert);
        }
    }

    /** 성공/부분성공 월 메타 upsert — crawled_at(마지막 성공 시각) 갱신. */
    @Transactional
    public void recordSuccessfulMeta(YearMonth yearMonth, FetchStatus status, LocalDateTime crawledAt,
                                     CrawlSource source, String lastError) {
        snapshotRepository.findByYearMonth(yearMonth).ifPresentOrElse(
                snapshot -> snapshot.recordSuccessful(crawledAt, source, status, lastError),
                () -> snapshotRepository.save(FacilityMonthSnapshot.create(yearMonth, crawledAt, source, status, lastError)));
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
