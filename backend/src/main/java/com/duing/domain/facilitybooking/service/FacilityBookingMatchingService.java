package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * CONFIRMED 자동 매칭 판정(§5.3) — P1 의 보수적 정확 매칭 정책. 이 클래스가 교체 가능한 판정 정책이며
 * 소비자(스케줄러)는 MatchDecision 만 본다. 확장 경로: 표기명 매핑(P2)·후보 큐 승격·유사도 제안.
 */
@Component
@RequiredArgsConstructor
public class FacilityBookingMatchingService {

    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final OrganizationNameNormalizer normalizer;
    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
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
     * 예약 1건 단위의 짧은 트랜잭션 — 상태 재확인 후 전이(멱등: APPROVED 가 아니면 조용히 스킵).
     * 스케줄러가 별도 빈인 이 서비스의 프록시를 통해 호출하므로 @Transactional 이 실제로 적용된다
     * (같은 클래스 self-invocation 회피). 판정(decide)과 적용(applyAutoConfirm)이 한 서비스로 모인다.
     *
     * <p>crawlBasisAt 은 판정 근거가 된 SUCCESS 스냅샷의 수집 시각(스케줄러가 전달) — 확정 시점(now)이 아니라
     * "어느 크롤 데이터로 확정했는가"를 이력·엔티티(crawl_basis_at)에 남긴다(승인 경로 관례와 필드 의미 일치).
     */
    @Transactional
    public void applyAutoConfirm(Long bookingId, MatchDecision decision, LocalDateTime crawlBasisAt) {
        FacilityBooking booking = facilityBookingRepository.findById(bookingId).orElse(null);
        // 관리자 전이(취소·충돌 전환)와의 경합은 @Version 낙관 잠금이 차단한다 — 늦은 커밋이 실패·롤백되어
        // 덮어쓰기가 불가능하고, 그 실패는 스케줄러의 per-booking 격리로 다음 사이클에 재판정된다.
        // 여기 상태 재확인은 이미 CONFIRMED/취소된 건을 조용히 스킵하는 멱등 게이트다.
        if (booking == null || booking.getStatus() != BookingStatus.APPROVED) {
            return;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        booking.confirmByMatching(decision.matchedScheduleSeq(), crawlBasisAt, now);
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), BookingStatus.APPROVED, BookingStatus.CONFIRMED,
                null, "크롤 데이터 자동 매칭 확정", crawlBasisAt));
    }
}
