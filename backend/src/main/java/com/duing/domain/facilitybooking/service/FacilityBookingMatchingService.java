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
     */
    @Transactional
    public void applyAutoConfirm(Long bookingId, MatchDecision decision) {
        FacilityBooking booking = facilityBookingRepository.findById(bookingId).orElse(null);
        if (booking == null || booking.getStatus() != BookingStatus.APPROVED) {
            return;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        booking.confirmByMatching(decision.matchedScheduleSeq(), now, now);
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), BookingStatus.APPROVED, BookingStatus.CONFIRMED,
                null, "크롤 데이터 자동 매칭 확정", now));
    }
}
