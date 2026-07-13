package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.BookingSlice;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.CrawlSlice;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 가용성 조회 조립(설계 §8.1) — 트랜잭션 없는 오케스트레이션이다. ensureFresh 가 온디맨드 크롤(delete+insert)을
 * 유발할 수 있어, 클래스 레벨 readOnly 트랜잭션에 편승시키면 PostgreSQL 25006(read-only 트랜잭션 내 DELETE 금지)
 * → 공개 GET 500 을 유발한다(기존 GeneralFacilityUsageService §5.4 와 동일 원칙). 각 조회는 리포지토리
 * 단건 호출로 자체 트랜잭션을 가지며 다중 쿼리 정합 요구가 없다.
 */
@Service
@RequiredArgsConstructor
public class GeneralFacilityAvailabilityService implements FacilityAvailabilityService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    // 예약 홈은 당월·익월 전용이라 TTL 은 항상 10분(선행 스펙 §5.5의 현재·다음월 TTL 과 동일 값)
    private static final Duration FRESH_TTL = Duration.ofMinutes(10);

    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityCrawlService facilityCrawlService;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final Clock clock;

    @Override
    public FacilityAvailabilityResponse getAvailability(Long facilityId, YearMonth requestedMonth) {
        YearMonth currentMonth = YearMonth.now(clock);
        YearMonth targetMonth = requestedMonth != null ? requestedMonth : currentMonth;
        if (!targetMonth.equals(currentMonth) && !targetMonth.equals(currentMonth.plusMonths(1))) {
            throw new FacilityBookingException.MonthOutOfBookingRangeException();
        }
        Facility facility = facilityRepository.findById(facilityId)
                .filter(found -> !found.isArchived())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);

        DataSource source = facilityCrawlService.ensureFresh(targetMonth);

        List<CrawlSlice> crawlSlices = facilityReservationRepository
                .findByFacilityIdAndYearMonth(facility.getId(), targetMonth).stream()
                .map(reservation -> new CrawlSlice(
                        reservation.getReservationDate(), reservation.getStartTime(), reservation.getEndTime(),
                        reservation.getOrganizationName(), availabilityPolicy.classify(reservation),
                        reservation.getReservedStartTime(), reservation.getReservedEndTime()))
                .toList();

        List<BookingSlice> bookingSlices = toBookingSlices(facility.getId(), targetMonth);

        LocalDateTime currentDateTime = LocalDateTime.now(clock);
        LocalDate today = currentDateTime.toLocalDate();
        LocalTime nowTime = currentDateTime.toLocalTime();
        FacilityMonthSnapshot snapshot = facilityMonthSnapshotRepository.findByYearMonth(targetMonth).orElse(null);
        LocalDateTime crawledAt = snapshot != null ? snapshot.getCrawledAt() : null;
        boolean stale = isStale(crawledAt, snapshot != null ? snapshot.getFetchStatus() : null, source);

        return new FacilityAvailabilityResponse(
                facility.getId(),
                targetMonth.toString(),
                toKstOffset(crawledAt),
                stale,
                today,
                currentMonth.plusMonths(1).atEndOfMonth(),
                FacilitySlotAssembler.assembleDays(targetMonth, today, nowTime, crawlSlices, bookingSlices));
    }

    private List<BookingSlice> toBookingSlices(Long facilityId, YearMonth targetMonth) {
        List<FacilityBooking> bookings =
                facilityBookingRepository.findByFacilityIdAndReservationDateBetweenAndStatusIn(
                        facilityId, targetMonth.atDay(1), targetMonth.atEndOfMonth(),
                        List.of(BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.CONFIRMED));
        // 동아리명은 조회하지 않는다 — 공개 가용성 API 는 내부 예약 동아리명 비노출 정책(2026-07-13 사용자 결정).
        return bookings.stream()
                .map(booking -> new BookingSlice(booking.getReservationDate(), booking.getStartTime(),
                        booking.getEndTime(), booking.getStatus()))
                .toList();
    }

    private boolean isStale(LocalDateTime crawledAt, FetchStatus fetchStatus, DataSource source) {
        if (source == DataSource.STALE_CACHE || crawledAt == null || fetchStatus != FetchStatus.SUCCESS) {
            return true;
        }
        return Duration.between(crawledAt, LocalDateTime.now(clock)).compareTo(FRESH_TTL) > 0;
    }

    private OffsetDateTime toKstOffset(LocalDateTime crawledAt) {
        // crawled_at 은 seoulClock 기준 KST wall-clock LocalDateTime 으로 저장된다 —
        // 기존 FacilityUsageResponse.toKst 와 동일한 변환(임의로 다른 변환을 만들면 +9h 오차).
        return crawledAt == null ? null : crawledAt.atZone(KST).toOffsetDateTime();
    }
}
