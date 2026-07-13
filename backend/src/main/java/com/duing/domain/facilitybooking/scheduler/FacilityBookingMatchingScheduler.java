package com.duing.domain.facilitybooking.scheduler;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService.MatchDecision;
import com.duing.domain.facilitybooking.service.OrganizationNameNormalizer;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
    private final FacilityRepository facilityRepository;
    private final FacilityBookingMatchingService matchingService;
    private final OrganizationNameNormalizer normalizer;
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
        // 사이클당 1회 — 정규화 후 2개 이상 동아리가 공유하는 키(오확정 위험)를 미리 모아 판정 전 게이트로 쓴다.
        Set<String> collidingClubKeys = collidingClubKeys();
        int confirmedCount = 0;
        for (YearMonth month : List.of(currentMonth, currentMonth.plusMonths(1))) {
            Optional<LocalDateTime> crawlBasisAt = successCrawledAt(month);
            if (crawlBasisAt.isEmpty()) {
                log.info("FacilityBooking Matching skip month={} (스냅샷 미신뢰)", month);
                continue;
            }
            confirmedCount += matchMonth(month, crawlBasisAt.get(), collidingClubKeys);
        }
        log.info("FacilityBooking Matching done confirmed={}", confirmedCount);
    }

    /**
     * 전체 동아리명 정규화 키 중 2개 이상 동아리가 공유하는 키 집합. "밴드부"·"밴드부(중앙)"이 정규화 후 같은
     * 키로 붕괴하면 다른 단체 행으로 오확정될 수 있어, 이런 키의 예약은 자동 확정을 포기하고 수동 확정으로 넘긴다.
     */
    private Set<String> collidingClubKeys() {
        Map<String, Long> keyCounts = clubRepository.findAll().stream()
                .map(club -> normalizer.normalize(club.getName()))
                .filter(key -> !key.isEmpty())
                .collect(Collectors.groupingBy(key -> key, Collectors.counting()));
        return keyCounts.entrySet().stream()
                .filter(entry -> entry.getValue() >= 2)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
    }

    /** SUCCESS 월이면 그 스냅샷의 크롤 수집 시각(판단 근거 = crawlBasisAt), 미신뢰 월이면 empty. */
    private Optional<LocalDateTime> successCrawledAt(YearMonth month) {
        return facilityMonthSnapshotRepository.findByYearMonth(month)
                .filter(snapshot -> snapshot.getFetchStatus() == FetchStatus.SUCCESS)
                .map(snapshot -> snapshot.getCrawledAt());
    }

    private int matchMonth(YearMonth month, LocalDateTime crawlBasisAt, Set<String> collidingClubKeys) {
        List<FacilityBooking> approvedBookings = facilityBookingRepository
                .findByStatusAndReservationDateBetween(BookingStatus.APPROVED,
                        month.atDay(1), month.atEndOfMonth());
        if (approvedBookings.isEmpty()) {
            return 0;
        }
        // 활성(미아카이브) 시설만 자동 확정 대상 — 아카이브 시설의 잔존 크롤 행(크롤이 삭제하지 않음)으로
        // 불가역 CONFIRMED 되는 것을 막는다.
        Set<Long> activeFacilityIds = facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc().stream()
                .map(Facility::getId).collect(Collectors.toSet());
        Map<Long, String> clubNames = clubRepository.findAllById(
                        approvedBookings.stream().map(FacilityBooking::getClubId).distinct().toList()).stream()
                .collect(Collectors.toMap(club -> club.getId(), club -> club.getName(), (first, second) -> first));

        // (시설,월) 크롤 행을 시설당 한 번만 조회해 재사용 — 같은 시설의 반복 조회 제거(날짜 필터는 예약별로 적용).
        Map<Long, List<FacilityReservation>> rowsByFacility = new HashMap<>();

        int confirmedCount = 0;
        for (FacilityBooking booking : approvedBookings) {
            // 한 건 처리 실패가 잔여 예약·익월 스캔을 죽이지 않도록 예약 단위로 격리한다(낙관 잠금 충돌 포함).
            try {
                if (!activeFacilityIds.contains(booking.getFacilityId())) {
                    log.info("FacilityBooking Matching skip bookingId={} (아카이브 시설)", booking.getId());
                    continue;
                }
                String clubName = clubNames.getOrDefault(booking.getClubId(), "");
                if (collidingClubKeys.contains(normalizer.normalize(clubName))) {
                    log.info("FacilityBooking Matching skip bookingId={} (정규화 키 충돌 — 수동 확정 폴백)",
                            booking.getId());
                    continue;
                }
                List<FacilityReservation> dayRows = rowsByFacility
                        .computeIfAbsent(booking.getFacilityId(), facilityId ->
                                facilityReservationRepository.findByFacilityIdAndYearMonth(facilityId, month))
                        .stream()
                        .filter(row -> row.getReservationDate().equals(booking.getReservationDate()))
                        // 행 신선도 가드 — SUCCESS 게이트+활성 시설 전제에서 전 행이 최신이지만, 세대 결박
                        // 방어로 스냅샷 기준보다 15분 넘게 오래된 행은 제외한다(15분=스케줄 크롤 최악 소요 상한).
                        .filter(row -> !row.getCrawledAt().isBefore(crawlBasisAt.minusMinutes(15)))
                        .toList();
                MatchDecision decision = matchingService.decide(booking, clubName, dayRows);
                if (decision.confirmed()) {
                    matchingService.applyAutoConfirm(booking.getId(), month, decision, crawlBasisAt);
                    confirmedCount++;
                }
            } catch (Exception exception) {
                log.error("FacilityBooking Matching 실패 bookingId={}", booking.getId(), exception);
            }
        }
        return confirmedCount;
    }
}
