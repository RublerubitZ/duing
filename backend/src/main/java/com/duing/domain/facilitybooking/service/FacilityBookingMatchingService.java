package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * CONFIRMED 자동 매칭 판정·확정(§5.3) — P1 의 보수적 정확 매칭 정책. 이 클래스가 교체 가능한 판정 정책이며
 * 소비자(스케줄러)는 판정(decide)의 순수 결과와 확정(verifyAndConfirm)의 성공 여부만 본다.
 * 확장 경로: 표기명 매핑(P2)·후보 큐 승격·유사도 제안.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FacilityBookingMatchingService {

    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final OrganizationNameNormalizer normalizer;
    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final Clock clock;

    public record MatchDecision(boolean confirmed, Long matchedScheduleSeq) {
        static MatchDecision none() {
            return new MatchDecision(false, null);
        }
    }

    /** dayRows = 해당 시설·해당 날짜의 크롤 행 전체(호출부가 필터). */
    public MatchDecision decide(FacilityBooking booking, String clubName, List<FacilityReservation> dayRows) {
        String normalizedClubName = normalizer.normalize(clubName);
        if (normalizedClubName.isEmpty()) {
            return MatchDecision.none();
        }
        List<FacilityReservation> matchingOccupiedRows = dayRows.stream()
                .filter(row -> availabilityPolicy.classify(row) == CrawlRowType.OCCUPIED)
                .filter(row -> normalizer.normalize(row.getOrganizationName()).equals(normalizedClubName))
                .toList();

        // 각 서브슬롯이 단일 점유행에 완전 포함되어야 커버로 인정 — 비정렬 크롤 행·분할 행은 미매칭(수동 확정 폴백, 보수 방향)
        Long representativeSeq = null;
        for (LocalTime slotStart = booking.getStartTime(); slotStart.isBefore(booking.getEndTime());
                slotStart = slotStart.plusHours(1)) {
            LocalTime slotEnd = slotStart.plusHours(1);
            LocalTime currentStart = slotStart;
            FacilityReservation covering = matchingOccupiedRows.stream()
                    .filter(row -> !row.getStartTime().isAfter(currentStart)
                            && !row.getEndTime().isBefore(slotEnd))
                    .findFirst()
                    .orElse(null);
            if (covering == null) {
                return MatchDecision.none();
            }
            if (representativeSeq == null) {
                representativeSeq = covering.getScheduleSeq();
            }
        }
        return new MatchDecision(true, representativeSeq);
    }

    /**
     * 예약 1건 단위의 검증·확정을 단일 트랜잭션으로 수행한다(§5.3). 스케줄러가 별도 빈인 이 서비스의 프록시를
     * 통해 호출하므로 @Transactional 이 실제로 적용된다(같은 클래스 self-invocation 회피). 판정 근거 데이터
     * 조회부터 상태 전이까지 한 트랜잭션에 묶어, 이전 세대 행과 메타 미갱신 상태의 다음 세대 행을 시간창(휴리스틱)이
     * 아닌 정확 세대 동일성으로 구분한다 — 15분 창의 오확정 여지를 제거한다.
     *
     * <p>세대 결박: 크롤은 사이클당 단일 crawledAt 을 시설 행과 월 스냅샷 메타 양쪽에 기록하고, 시설별 행 교체는
     * 단일 트랜잭션이라 한 시설의 행들은 세대가 균일하다. 따라서 {@code row.crawledAt == snapshot.crawledAt}
     * 이 세대 동일성의 정확한 판별식이다 — 불일치 행은 세대 전환 중이라는 신호이므로 fail-closed 로 제외한다.
     *
     * <p>confirmByMatching 의 crawlBasisAt·이력 crawlBasisAt 에는 확정 시점(now)이 아니라 판정 근거 세대의
     * 수집 시각(generation)을 남긴다 — "어느 크롤 데이터로 확정했는가"를 기록(승인 경로 관례와 필드 의미 일치).
     *
     * @return 이 호출로 CONFIRMED 로 전이했으면 true, 스킵(멱등·아카이브·세대 미신뢰·키 충돌·미매칭)이면 false
     */
    @Transactional
    public boolean verifyAndConfirm(Long bookingId, String clubName, Set<String> ambiguousNormalizedKeys) {
        FacilityBooking booking = facilityBookingRepository.findById(bookingId).orElse(null);
        // 관리자 전이(취소·충돌 전환)와의 경합은 @Version 낙관 잠금이 차단한다 — 늦은 커밋이 실패·롤백되어
        // 덮어쓰기가 불가능하고, 그 실패는 스케줄러의 per-booking 격리로 다음 사이클에 재판정된다.
        // 여기 상태 재확인은 이미 CONFIRMED/취소된 건을 조용히 스킵하는 멱등 게이트다.
        if (booking == null || booking.getStatus() != BookingStatus.APPROVED) {
            return false;
        }
        // 시설 행 PESSIMISTIC_WRITE — 동기화 잡의 아카이브 UPDATE 와 직렬화해 재확인 후 아카이브되는 TOCTOU 차단
        // (승인 경로와 동일 잠금이라 상호 직렬화 부수 효과도 안전). 아카이브 시설의 잔존 크롤 행(크롤이 삭제하지
        // 않음)으로 오확정 CONFIRMED 되는 것을 막는다 — 관리자 취소 복구 경로가 생겼어도(§4.2) 오확정 자체를
        // 만들지 않는 것이 이 가드의 몫이다.
        Facility facility = facilityRepository.findByIdForUpdate(booking.getFacilityId()).orElse(null);
        if (facility == null) {
            log.info("FacilityBooking Matching skip bookingId={} (시설 없음)", bookingId);
            return false;
        }
        if (facility.isArchived()) {
            log.info("FacilityBooking Matching skip bookingId={} (아카이브 시설)", bookingId);
            return false;
        }
        // 스냅샷 세대 재확인 — SUCCESS 가 아니면 스킵. generation = 이 세대의 크롤 수집 시각(판단 근거).
        YearMonth month = YearMonth.from(booking.getReservationDate());
        FacilityMonthSnapshot snapshot = facilityMonthSnapshotRepository.findByYearMonth(month).orElse(null);
        if (snapshot == null || snapshot.getFetchStatus() != FetchStatus.SUCCESS) {
            return false;
        }
        LocalDateTime generation = snapshot.getCrawledAt();
        // 정확 세대 결박 — 행·메타는 사이클당 단일 crawledAt 을 공유하므로 generation 과 일치하는 행만 사용한다.
        // 불일치는 세대 전환 중이라는 신호이므로 fail-closed 로 제외한다(예약 날짜 필터도 함께 적용).
        List<FacilityReservation> freshRows = facilityReservationRepository
                .findByFacilityIdAndYearMonth(booking.getFacilityId(), month).stream()
                .filter(row -> row.getReservationDate().equals(booking.getReservationDate()))
                .filter(row -> row.getCrawledAt().equals(generation))
                .toList();
        // 정규화 키 충돌 가드 — 2개 이상 동아리가 공유하는 정규화 키의 예약은 오확정 위험이라 자동 확정을 포기한다.
        if (ambiguousNormalizedKeys.contains(normalizer.normalize(clubName))) {
            log.info("FacilityBooking Matching skip bookingId={} (정규화 키 충돌 — 수동 확정 폴백)", bookingId);
            return false;
        }
        MatchDecision decision = decide(booking, clubName, freshRows);
        if (!decision.confirmed()) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        booking.confirmByMatching(decision.matchedScheduleSeq(), generation, now);
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), BookingStatus.APPROVED, BookingStatus.CONFIRMED,
                null, "크롤 데이터 자동 매칭 확정", generation));
        return true;
    }
}
