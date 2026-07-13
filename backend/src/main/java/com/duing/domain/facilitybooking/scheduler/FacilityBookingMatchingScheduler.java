package com.duing.domain.facilitybooking.scheduler;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService.MatchDecision;
import java.time.Clock;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * APPROVED → CONFIRMED 자동 매칭 잡(§5.3). 크롤 잡(매 10분 0초)과 3분 오프셋으로 최신 스냅샷을 뒤따른다.
 * fetch_status=SUCCESS 월만 신뢰하고, 판정은 FacilityBookingMatchingService(교체 가능 정책)에 위임한다.
 * 예약 1건 단위 확정도 같은 서비스의 {@link FacilityBookingMatchingService#applyAutoConfirm}(짧은 트랜잭션)에
 * 위임한다 — @Transactional self-invocation 을 피하려고 판정·적용을 한 서비스 프록시로 모았다.
 * AtomicBoolean.compareAndSet 으로 in-JVM 중복 실행을 막는다(이전 사이클 진행 중이면 skip).
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "duing.facility.booking.matching", name = "enabled", havingValue = "true")
public class FacilityBookingMatchingScheduler {

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityBookingMatchingService matchingService;
    private final ClubRepository clubRepository;
    private final Clock clock;

    private final AtomicBoolean running = new AtomicBoolean(false);

    @Scheduled(cron = "0 3-59/10 * * * *", zone = "Asia/Seoul")
    public void runScheduled() {
        if (!running.compareAndSet(false, true)) {
            log.info("FacilityBooking Matching skip: 이전 사이클이 아직 진행 중");
            return;
        }
        try {
            runMatchingCycle();
        } finally {
            running.set(false);
        }
    }

    /** 테스트에서 직접 호출 가능한 코어 — 당월·익월의 APPROVED 를 스캔한다. */
    public void runMatchingCycle() {
        YearMonth currentMonth = YearMonth.now(clock);
        int confirmedCount = 0;
        for (YearMonth month : List.of(currentMonth, currentMonth.plusMonths(1))) {
            if (!isSuccessSnapshot(month)) {
                log.info("FacilityBooking Matching skip month={} (스냅샷 미신뢰)", month);
                continue;
            }
            confirmedCount += matchMonth(month);
        }
        log.info("FacilityBooking Matching done confirmed={}", confirmedCount);
    }

    private boolean isSuccessSnapshot(YearMonth month) {
        return facilityMonthSnapshotRepository.findByYearMonth(month)
                .map(snapshot -> snapshot.getFetchStatus() == FetchStatus.SUCCESS)
                .orElse(false);
    }

    private int matchMonth(YearMonth month) {
        List<FacilityBooking> approvedBookings = facilityBookingRepository
                .findByStatusAndReservationDateBetween(BookingStatus.APPROVED,
                        month.atDay(1), month.atEndOfMonth());
        if (approvedBookings.isEmpty()) {
            return 0;
        }
        Map<Long, String> clubNames = clubRepository.findAllById(
                        approvedBookings.stream().map(FacilityBooking::getClubId).distinct().toList()).stream()
                .collect(Collectors.toMap(club -> club.getId(), club -> club.getName(), (first, second) -> first));

        int confirmedCount = 0;
        for (FacilityBooking booking : approvedBookings) {
            List<FacilityReservation> dayRows = facilityReservationRepository
                    .findByFacilityIdAndYearMonth(booking.getFacilityId(), month).stream()
                    .filter(row -> row.getReservationDate().equals(booking.getReservationDate()))
                    .toList();
            MatchDecision decision = matchingService.decide(
                    booking, clubNames.getOrDefault(booking.getClubId(), ""), dayRows);
            if (decision.confirmed()) {
                matchingService.applyAutoConfirm(booking.getId(), decision);
                confirmedCount++;
            }
        }
        return confirmedCount;
    }
}
