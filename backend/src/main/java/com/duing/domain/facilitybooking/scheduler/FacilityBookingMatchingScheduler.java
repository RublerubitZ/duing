package com.duing.domain.facilitybooking.scheduler;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService;
import com.duing.domain.facilitybooking.service.OrganizationNameNormalizer;
import java.time.Clock;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * APPROVED → CONFIRMED 자동 매칭 잡(§5.3). 크롤 잡(매 10분 0초)과 3분 오프셋으로 최신 스냅샷을 뒤따른다.
 * fetch_status=SUCCESS·PARTIAL 월을 신뢰하고(PARTIAL 안전성은 세대 결박이 보장, 2026-07-17 감사),
 * 예약 1건 단위의 검증·확정은 전 과정을 단일 트랜잭션으로 수행하는
 * {@link FacilityBookingMatchingService#verifyAndConfirm}(교체 가능 정책 + 정확 세대 결박)에 위임한다 —
 * @Transactional self-invocation 을 피하려고 별도 빈 프록시로 호출한다.
 * AtomicBoolean.compareAndSet 으로 in-JVM 중복 실행을 막는다(이전 사이클 진행 중이면 skip).
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "duing.facility.booking.matching", name = "enabled", havingValue = "true")
public class FacilityBookingMatchingScheduler {

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
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
        // 사이클당 1회 — 정규화 후 2개 이상 동아리가 공유하는 키(오확정 위험)를 미리 모아 verifyAndConfirm 에 넘긴다.
        Set<String> collidingClubKeys = collidingClubKeys();
        int confirmedCount = 0;
        for (YearMonth month : List.of(currentMonth, currentMonth.plusMonths(1))) {
            // 신뢰 스냅샷 사전 게이트(빠른 스킵) — 세대 결박·확정은 verifyAndConfirm 이 트랜잭션 안에서 재확인한다.
            if (!hasTrustedSnapshot(month)) {
                log.info("FacilityBooking Matching skip month={} (스냅샷 신뢰 불가 — FAILED 또는 미기록)", month);
                continue;
            }
            confirmedCount += matchMonth(month, collidingClubKeys);
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

    /** 신뢰 가능(SUCCESS·PARTIAL) 월 스냅샷 존재 여부(빠른 스킵 게이트) — PARTIAL 의 안전성은 세대 결박이
     *  보장한다(실패 룸의 구세대 행은 fail-closed 제외, 2026-07-17 감사). 세대 결박·확정은 verifyAndConfirm
     *  이 트랜잭션 안에서 재확인한다. */
    private boolean hasTrustedSnapshot(YearMonth month) {
        return facilityMonthSnapshotRepository.findByYearMonth(month)
                .map(snapshot -> snapshot.getFetchStatus() != FetchStatus.FAILED)
                .orElse(false);
    }

    private int matchMonth(YearMonth month, Set<String> collidingClubKeys) {
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
            // 한 건 처리 실패(낙관 잠금 충돌 포함)가 잔여 예약·익월 스캔을 죽이지 않도록 예약 단위로 격리한다.
            // 검증·아카이브 재확인·세대 결박·확정은 모두 verifyAndConfirm 의 단일 트랜잭션 안에서 이뤄진다.
            try {
                String clubName = clubNames.getOrDefault(booking.getClubId(), "");
                if (matchingService.verifyAndConfirm(booking.getId(), clubName, collidingClubKeys)) {
                    confirmedCount++;
                }
            } catch (ObjectOptimisticLockingFailureException concurrentTransition) {
                // 관리자 전이(취소·충돌 전환)와의 경합은 설계상 정상 스킵(verifyAndConfirm 주석의 계약) —
                // ERROR 로 남기면 Sentry 알람이 되므로 INFO 로 강등한다(지원서 도메인 전례).
                log.info("FacilityBooking Matching 경합 스킵 bookingId={} (관리자 전이 선행 — 다음 사이클 재판정)",
                        booking.getId());
            } catch (Exception exception) {
                log.error("FacilityBooking Matching 실패 bookingId={}", booking.getId(), exception);
            }
        }
        return confirmedCount;
    }
}
