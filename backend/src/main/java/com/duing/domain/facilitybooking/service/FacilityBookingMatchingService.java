package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import java.time.LocalTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * CONFIRMED 자동 매칭 판정(§5.3) — P1 의 보수적 정확 매칭 정책. 이 클래스가 교체 가능한 판정 정책이며
 * 소비자(스케줄러)는 MatchDecision 만 본다. 확장 경로: 표기명 매핑(P2)·후보 큐 승격·유사도 제안.
 */
@Component
@RequiredArgsConstructor
public class FacilityBookingMatchingService {

    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final OrganizationNameNormalizer normalizer;

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

        // 예약의 모든 1시간 서브슬롯이 빠짐없이 덮여야 자동 확정(보수적 정확 매칭)
        Long representativeSeq = null;
        for (LocalTime slotStart = booking.getStartTime(); slotStart.isBefore(booking.getEndTime());
                slotStart = slotStart.plusHours(1)) {
            LocalTime slotEnd = slotStart.plusHours(1);
            LocalTime currentStart = slotStart;
            FacilityReservation covering = matchingOccupiedRows.stream()
                    .filter(row -> row.getStartTime().isBefore(slotEnd)
                            && row.getEndTime().isAfter(currentStart))
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
}
