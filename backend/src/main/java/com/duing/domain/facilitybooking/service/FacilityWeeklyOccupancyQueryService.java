package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.BookingSlice;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.CrawlSlice;
import com.duing.domain.facilitybooking.service.dto.query.FacilityWeeklyOccupancyQuery;
import com.duing.domain.facilitybooking.service.dto.query.FacilityWeeklyOccupancyQuery.FacilityRow;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주간 시설 점유 — 시설별 하루마다 예약이 걸친 1시간 칸 수(09~22시, 0~13). 칸 판정은 예약 캘린더
 * (GeneralFacilityAvailabilityService#getAvailability)와 같은 {@link FacilitySlotAssembler} 를 그대로 거친다 —
 * 내부 APPROVED·CONFIRMED ∪ 학교 실예약(CRAWLED_RESERVATION), 기본 확보 시간 행 제외, 겹치면 칸 하나.
 * 저장된 행만 읽고 온디맨드 크롤(ensureFresh)을 부르지 않아 readOnly 트랜잭션에 둘 수 있다 — 가용성 서비스와 다른 점이다.
 * 지난 달 학교 일정은 마지막 수집 상태 그대로다(당월·익월만 다시 수집한다).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FacilityWeeklyOccupancyQueryService {

    private static final int DAYS_IN_WEEK = 7;

    private final FacilityRepository facilityRepository;
    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final Clock clock;

    public FacilityWeeklyOccupancyQuery getWeeklyOccupancy(LocalDate firstDay) {
        LocalDate lastDay = firstDay.plusDays(DAYS_IN_WEEK - 1);
        List<YearMonth> months = Stream.of(YearMonth.from(firstDay), YearMonth.from(lastDay)).distinct().toList();
        List<FacilityReservation> crawlRows = months.stream()
                .flatMap(month -> facilityReservationRepository.findByYearMonth(month).stream())
                .toList();
        // 분류가 칸을 가른다(실예약만 차단·확보 시간 비차단) — 확보 대상 키는 크롤 행이 있을 때만 요청당 1회 조회한다(가용성 서비스와 같다).
        Set<String> securedOrganizationKeys = crawlRows.isEmpty() ? Set.of() : availabilityPolicy.securedOrganizationKeys();
        Map<Long, List<CrawlSlice>> crawlSlicesByFacility = crawlRows.stream()
                .collect(Collectors.groupingBy(FacilityReservation::getFacilityId, Collectors.mapping(
                        reservation -> new CrawlSlice(reservation.getReservationDate(), reservation.getStartTime(),
                                reservation.getEndTime(), reservation.getOrganizationName(),
                                availabilityPolicy.classify(reservation, securedOrganizationKeys)),
                        Collectors.toList())));
        // 칸을 막는 상태(APPROVED·CONFIRMED)만 읽는다 — 캘린더가 함께 읽는 PENDING 은 BLOCKED 가 되지 않아 결과가 같다.
        Map<Long, List<BookingSlice>> bookingSlicesByFacility = facilityBookingRepository
                .findByReservationDateBetweenAndStatusIn(firstDay, lastDay, BookingStatus.slotBlockingStatuses()).stream()
                .collect(Collectors.groupingBy(FacilityBooking::getFacilityId, Collectors.mapping(
                        booking -> new BookingSlice(booking.getReservationDate(), booking.getStartTime(),
                                booking.getEndTime(), booking.getStatus(), null),
                        Collectors.toList())));
        LocalDateTime currentDateTime = LocalDateTime.now(clock);
        List<FacilityRow> rows = facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc().stream()
                // sort_order 동점(기본 0)은 id 로 고정한다 — 지난주·이번 주 두 표가 같은 순서여야 한다(스펙 §3-6).
                .sorted(Comparator.comparing(Facility::getSortOrder).thenComparing(Facility::getId))
                .map(facility -> new FacilityRow(facility.getId(), facility.getRoomName(), facility.getSortOrder(),
                        occupiedSlotCounts(firstDay, months, currentDateTime,
                                crawlSlicesByFacility.getOrDefault(facility.getId(), List.of()),
                                bookingSlicesByFacility.getOrDefault(facility.getId(), List.of()))))
                .toList();
        LocalDateTime currentMonthCrawledAt = facilityMonthSnapshotRepository
                .findByYearMonth(YearMonth.from(currentDateTime))
                .map(FacilityMonthSnapshot::getCrawledAt)
                .orElse(null);
        return new FacilityWeeklyOccupancyQuery(rows, currentMonthCrawledAt);
    }

    /**
     * 예약 캘린더와 같은 조립기로 그 달을 그린 뒤 주 7일의 점유(BLOCKED) 칸만 센다.
     * 점유가 지난 시각(PAST)·신청 마감보다 먼저 판정돼 오늘 시각과 무관하다.
     */
    private static List<Integer> occupiedSlotCounts(LocalDate firstDay, List<YearMonth> months,
                                                    LocalDateTime currentDateTime, List<CrawlSlice> crawlSlices,
                                                    List<BookingSlice> bookingSlices) {
        Map<LocalDate, Integer> occupiedByDate = months.stream()
                .flatMap(month -> FacilitySlotAssembler.assembleDays(month, currentDateTime.toLocalDate(),
                        currentDateTime.toLocalTime(), crawlSlices, bookingSlices).stream())
                .collect(Collectors.toMap(DayAvailability::date,
                        day -> (int) day.slots().stream().filter(slot -> slot.status() == SlotStatus.BLOCKED).count()));
        return firstDay.datesUntil(firstDay.plusDays(DAYS_IN_WEEK)).map(occupiedByDate::get).toList();
    }
}
