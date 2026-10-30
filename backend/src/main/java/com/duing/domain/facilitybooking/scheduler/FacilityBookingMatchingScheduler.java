package com.duing.domain.facilitybooking.scheduler;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityPolicy;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService;
import com.duing.domain.facilitybooking.service.OrganizationNameNormalizer;
import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.JobRunRecorder;
import com.duing.global.jobrun.MonitoredJob;
import java.time.Clock;
import java.time.Instant;
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
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final ClubRepository clubRepository;
    private final Clock clock;
    private final JobRunRecorder jobRunRecorder;

    private final AtomicBoolean running = new AtomicBoolean(false);

    /** 한 사이클 결과 — 확정 수, 예약 단위 예상 밖 실패 수(낙관 잠금 경합 제외), 신뢰할 스냅샷이 없어 건너뛴 달 수. */
    public record MatchingCycleResult(int confirmedCount, int failedCount, int skippedMonths) {}

    private record MonthMatchResult(int confirmedCount, int failedCount) {}

    @Scheduled(cron = "0 3-59/10 * * * *", zone = "Asia/Seoul")
    public void runScheduled() {
        if (!running.compareAndSet(false, true)) {
            log.info("FacilityBooking Matching skip: 이전 사이클이 아직 진행 중");
            return;
        }
        Instant startedAt = Instant.now(clock);
        try {
            MatchingCycleResult cycleResult = runMatchingCycle();
            // 건너뛴 달도 실패로 센다 — 두 달 모두 건너뛰면 아무것도 확인하지 못한 것이다(총동연 홈 자동 작업 카드).
            int failedCount = cycleResult.failedCount() + cycleResult.skippedMonths();
            jobRunRecorder.record(MonitoredJob.FACILITY_BOOKING_MATCHING, startedAt,
                    JobRunOutcome.of(failedCount), cycleResult.confirmedCount(), failedCount);
        } catch (RuntimeException matchingFailure) {
            jobRunRecorder.record(MonitoredJob.FACILITY_BOOKING_MATCHING, startedAt, JobRunOutcome.FAILED, 0, 0);
            throw matchingFailure;
        } finally {
            running.set(false);
        }
    }

    /** 테스트에서 직접 호출 가능한 코어 — 당월·익월의 APPROVED 를 스캔한다. */
    public MatchingCycleResult runMatchingCycle() {
        YearMonth currentMonth = YearMonth.now(clock);
        // 사이클당 1회 — 정규화 후 2개 이상 동아리가 공유하는 키(오확정 위험)를 미리 모아 verifyAndConfirm 에 넘긴다.
        // 기본 확보 시간 증거 제외는 행 단위 정밀화(2026-08-27)로 decide 가 securedTail 플래그로 수행한다.
        Set<String> collidingClubKeys = availabilityPolicy.collidingClubKeys();
        // 확보 키도 사이클당 1회 — 증거 판정이 아니라 타 단체 겹침 보류의 차단 분류(확보 물결 행 제외) 전용이다.
        // 사이클 중 플래그가 바뀌는 시차(TOCTOU)의 최악은 보류(수동 검토)이지 오확정이 아니다(fail-closed).
        Set<String> securedOrganizationKeys = availabilityPolicy.securedOrganizationKeys();
        int confirmedCount = 0;
        int failedCount = 0;
        int skippedMonths = 0;
        for (YearMonth month : List.of(currentMonth, currentMonth.plusMonths(1))) {
            // 신뢰 스냅샷 사전 게이트(빠른 스킵) — 세대 결박·확정은 verifyAndConfirm 이 트랜잭션 안에서 재확인한다.
            if (!hasTrustedSnapshot(month)) {
                log.info("FacilityBooking Matching skip month={} (스냅샷 신뢰 불가 — FAILED 또는 미기록)", month);
                skippedMonths++;
                continue;
            }
            MonthMatchResult monthResult = matchMonth(month, collidingClubKeys, securedOrganizationKeys);
            confirmedCount += monthResult.confirmedCount();
            failedCount += monthResult.failedCount();
        }
        log.info("FacilityBooking Matching done confirmed={} failed={} skippedMonths={}",
                confirmedCount, failedCount, skippedMonths);
        return new MatchingCycleResult(confirmedCount, failedCount, skippedMonths);
    }

    /** 신뢰 가능(SUCCESS·PARTIAL) 월 스냅샷 존재 여부(빠른 스킵 게이트) — PARTIAL 의 안전성은 세대 결박이
     *  보장한다(실패 룸의 구세대 행은 fail-closed 제외, 2026-07-17 감사). 세대 결박·확정은 verifyAndConfirm
     *  이 트랜잭션 안에서 재확인한다. */
    private boolean hasTrustedSnapshot(YearMonth month) {
        return facilityMonthSnapshotRepository.findByYearMonth(month)
                .map(snapshot -> snapshot.getFetchStatus() != FetchStatus.FAILED)
                .orElse(false);
    }

    private MonthMatchResult matchMonth(YearMonth month, Set<String> collidingClubKeys, Set<String> securedOrganizationKeys) {
        List<FacilityBooking> approvedBookings = facilityBookingRepository
                .findByStatusAndReservationDateBetween(BookingStatus.APPROVED,
                        month.atDay(1), month.atEndOfMonth());
        if (approvedBookings.isEmpty()) {
            return new MonthMatchResult(0, 0);
        }
        Map<Long, String> clubNames = clubRepository.findNameRowsByIdIn(
                        approvedBookings.stream().map(FacilityBooking::getClubId).distinct().toList()).stream()
                .collect(Collectors.toMap(ClubRepository.ClubNameProjection::getId,
                        ClubRepository.ClubNameProjection::getName, (first, second) -> first));

        int confirmedCount = 0;
        int failedCount = 0;
        for (FacilityBooking booking : approvedBookings) {
            // 한 건 처리 실패(낙관 잠금 충돌 포함)가 잔여 예약·익월 스캔을 죽이지 않도록 예약 단위로 격리한다.
            // 검증·아카이브 재확인·세대 결박·확정은 모두 verifyAndConfirm 의 단일 트랜잭션 안에서 이뤄진다.
            try {
                String clubName = clubNames.getOrDefault(booking.getClubId(), "");
                if (matchingService.verifyAndConfirm(booking.getId(), clubName, collidingClubKeys,
                        securedOrganizationKeys)) {
                    confirmedCount++;
                }
            } catch (ObjectOptimisticLockingFailureException concurrentTransition) {
                // 관리자 전이(취소·충돌 전환)와의 경합은 설계상 정상 스킵(verifyAndConfirm 주석의 계약) —
                // ERROR 로 두면 Sentry 알람(minimum-event-level: error)이 되므로, 낙관 잠금 충돌의 기존
                // 컨벤션(GlobalExceptionHandler 의 WARN 409 변환)과 같은 WARN 으로 강등한다.
                log.warn("FacilityBooking Matching 경합 스킵 bookingId={} (관리자 전이 선행 — 다음 사이클 재판정)",
                        booking.getId());
            } catch (Exception exception) {
                failedCount++;
                log.error("FacilityBooking Matching 실패 bookingId={}", booking.getId(), exception);
            }
        }
        return new MonthMatchResult(confirmedCount, failedCount);
    }
}
