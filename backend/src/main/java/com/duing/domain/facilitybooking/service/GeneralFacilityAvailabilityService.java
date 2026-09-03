package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facility.service.SnapshotFreshnessPolicy;
import com.duing.domain.facilitybooking.controller.dto.response.BookingWindowResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.PurposePresetResponse;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingPurposePresetRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.BookingSlice;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.CrawlSlice;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 가용성 조회 조립(설계 §8.1) — 트랜잭션 없는 오케스트레이션이다. ensureFresh 가 온디맨드 크롤(예약 행 쓰기)을
 * 유발할 수 있어, 클래스 레벨 readOnly 트랜잭션에 편승시키면 PostgreSQL 25006(read-only 트랜잭션 내 DELETE 금지)
 * → 공개 GET 500 을 유발한다(기존 GeneralFacilityUsageService §5.4 와 동일 원칙). 각 조회는 리포지토리
 * 단건 호출로 자체 트랜잭션을 가지며 다중 쿼리 정합 요구가 없다.
 */
@Service
@RequiredArgsConstructor
public class GeneralFacilityAvailabilityService implements FacilityAvailabilityService {

    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingPurposePresetRepository purposePresetRepository;
    private final ClubRepository clubRepository;
    private final FacilityCrawlService facilityCrawlService;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final BookingApplicationPolicy bookingApplicationPolicy;
    private final Clock clock;

    @Override
    public FacilityAvailabilityResponse getAvailability(Long facilityId, YearMonth requestedMonth) {
        YearMonth currentMonth = YearMonth.now(clock);
        YearMonth targetMonth = requestedMonth != null ? requestedMonth : currentMonth;
        // 열람 범위 = 직전 월·당월·익월. 직전 월은 기록 열람 전용(저장 스냅샷 그대로, 재크롤 없음 — 2026-09-03 스펙 §2.1).
        // 신청 가능 범위는 별개로 BookingApplicationPolicy(반월 창·마감)가 판정한다.
        if (targetMonth.isBefore(currentMonth.minusMonths(1)) || targetMonth.isAfter(currentMonth.plusMonths(1))) {
            throw new FacilityBookingException.MonthOutOfBookingRangeException();
        }
        boolean pastMonth = targetMonth.isBefore(currentMonth);
        Facility facility = facilityRepository.findById(facilityId)
                .filter(found -> !found.isArchived())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);

        // 직전 월은 크롤 윈도우(당월·익월) 밖이라 온디맨드 재크롤을 걸지 않는다 — 저장된 행을 그대로 보여주는 기록 열람.
        // past 경로의 CACHE 는 "캐시 서빙" 이라는 사실 표기이며 stale 판정은 아래 isIncompleteRecord 가 한다(source 미참조).
        DataSource source = pastMonth ? DataSource.CACHE : facilityCrawlService.ensureFresh(targetMonth);

        // 분류가 차단 여부를 가른다(실예약만 차단·확보 시간 비차단) — 기본 확보 시간 대상 키는 크롤 행이 있을 때만 요청당 1회 조회한다.
        List<FacilityReservation> crawlRows =
                facilityReservationRepository.findByFacilityIdAndYearMonth(facility.getId(), targetMonth);
        Set<String> securedOrganizationKeys =
                crawlRows.isEmpty() ? Set.of() : availabilityPolicy.securedOrganizationKeys();
        List<CrawlSlice> crawlSlices = crawlRows.stream()
                .map(reservation -> new CrawlSlice(
                        reservation.getReservationDate(), reservation.getStartTime(), reservation.getEndTime(),
                        reservation.getOrganizationName(),
                        availabilityPolicy.classify(reservation, securedOrganizationKeys)))
                .toList();

        List<BookingSlice> bookingSlices = toBookingSlices(facility.getId(), targetMonth);

        LocalDateTime currentDateTime = LocalDateTime.now(clock);
        LocalDate today = currentDateTime.toLocalDate();
        LocalTime nowTime = currentDateTime.toLocalTime();
        FacilityMonthSnapshot snapshot = facilityMonthSnapshotRepository.findByYearMonth(targetMonth).orElse(null);
        LocalDateTime crawledAt = snapshot != null ? snapshot.getCrawledAt() : null;
        // 과거 월 기록은 신선도(TTL)가 아니라 완결성만 본다 — TTL 을 적용하면 항상 stale 이 되어 기록 열람 내내 배너가 붙는다.
        boolean stale = pastMonth
                ? isIncompleteRecord(snapshot)
                : isStale(crawledAt, snapshot != null ? snapshot.getFetchStatus() : null, source);

        BookingWindow window = bookingApplicationPolicy.windowFor(facility, today);
        return new FacilityAvailabilityResponse(
                facility.getId(),
                targetMonth.toString(),
                // crawled_at 은 seoulClock 기준 KST wall-clock LocalDateTime 저장값 — TimeMapper 로 절대시각 환산.
                TimeMapper.seoulWallClockToInstant(crawledAt),
                stale,
                window.from(),
                window.until(),
                FacilitySlotAssembler.assembleDays(targetMonth, today, nowTime, crawlSlices, bookingSlices));
    }

    @Override
    public BookingWindowResponse getBookingWindow() {
        // 폐기 예정(P8): 구 FE 번들의 월 기본값·주 이동 클램프용 참조 창. 시설별 창은 availability 가 내린다.
        return BookingWindowResponse.from(bookingApplicationPolicy.referenceWindow(LocalDate.now(clock)));
    }

    @Override
    public List<PurposePresetResponse> listActivePurposePresets() {
        return purposePresetRepository.findByActiveTrueOrderBySortOrderAsc().stream()
                .map(PurposePresetResponse::from)
                .toList();
    }

    private List<BookingSlice> toBookingSlices(Long facilityId, YearMonth targetMonth) {
        List<FacilityBooking> bookings =
                facilityBookingRepository.findByFacilityIdAndReservationDateBetweenAndStatusIn(
                        facilityId, targetMonth.atDay(1), targetMonth.atEndOfMonth(),
                        BookingStatus.normalPathStatuses());
        // BLOCKED(INTERNAL) 대상(APPROVED/CONFIRMED)만 동아리명을 노출한다 — 승인 완료 예약은 학교 반영 후
        // 크롤 SCHOOL 행으로 어차피 실명 공개되므로 새 정보가 아니다(2026-07-17 사용자 결정 §4⁗.1로 구
        // 비노출 정책 부분 반전). PENDING 은 신청 경쟁 정보라 비노출 유지 → 이름을 조회·주입하지 않는다.
        Map<Long, String> blockingClubNames = resolveBlockingClubNames(bookings);
        return bookings.stream()
                .map(booking -> new BookingSlice(booking.getReservationDate(), booking.getStartTime(),
                        booking.getEndTime(), booking.getStatus(),
                        booking.getStatus().blocksSlot() ? blockingClubNames.get(booking.getClubId()) : null))
                .toList();
    }

    private Map<Long, String> resolveBlockingClubNames(List<FacilityBooking> bookings) {
        List<Long> blockingClubIds = bookings.stream()
                .filter(booking -> booking.getStatus().blocksSlot())
                .map(FacilityBooking::getClubId)
                .distinct()
                .toList();
        if (blockingClubIds.isEmpty()) {
            return Map.of();
        }
        // findAllById 는 @SQLRestriction(deleted_at IS NULL) 로 soft-delete 된 동아리를 제외하므로,
        // 삭제된 동아리 예약은 맵에 없어 null 로 내려가고 FE 는 '예약됨' 폴백을 쓴다(방어적 기본값).
        return clubRepository.findAllById(blockingClubIds).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName, (first, second) -> first));
    }

    /** 당월·익월은 고정 10분 TTL(선행 스펙 §5.5의 현재·다음월 TTL 정책 파라미터). 직전 월은 isIncompleteRecord 가 대신한다. */
    private boolean isStale(LocalDateTime crawledAt, FetchStatus fetchStatus, DataSource source) {
        return SnapshotFreshnessPolicy.isStale(source, fetchStatus, crawledAt,
                SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, LocalDateTime.now(clock));
    }

    /** 과거 월 기록의 stale — 스냅샷이 없거나 SUCCESS 가 아니면(PARTIAL·FAILED) 불완전한 기록이다. */
    private static boolean isIncompleteRecord(FacilityMonthSnapshot snapshot) {
        return snapshot == null || snapshot.getFetchStatus() != FetchStatus.SUCCESS;
    }

}
