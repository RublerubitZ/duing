package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayStatus;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotBlockSource;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 가용성 슬롯 계산(전면 차단 설계 §3.3) — 순수 함수. 입력은 서비스가 크롤 엔티티·Booking 을 slice 로 매핑해
 * 넣는다(엔티티에 직접 의존하지 않아 단위 테스트가 쉽고, 판별 정책은 호출부의 FacilityAvailabilityPolicy 가 담당).
 *
 * <p>크롤 slice 는 분류와 무관하게 전부 차단한다(P1·P3). 슬롯 판정 우선순위(공존 시 표시 순서):
 * PAST → BLOCKED(INTERNAL) → BLOCKED(SCHOOL=CRAWLED_RESERVATION) → BLOCKED(BASIC_SECURED)
 * → PENDING_HOLD → AVAILABLE. operatingNotes 는 구 계약 유지를 위해 항상 빈 배열로 발행한다
 * (비차단 운영행 개념 폐지 — 필드 제거는 후속).
 */
public final class FacilitySlotAssembler {

    public static final LocalTime OPEN_TIME = LocalTime.of(9, 0);
    public static final int SLOT_COUNT = 13; // 09~22시, 1시간 단위

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private FacilitySlotAssembler() {
    }

    /** 크롤 행 slice — type 은 FacilityAvailabilityPolicy 분류 결과(둘 다 차단, 표시 구분 전용). */
    public record CrawlSlice(LocalDate date, LocalTime start, LocalTime end, String organization,
                             CrawlRowType type) {}

    /**
     * 내부 예약 slice. organization 은 BLOCKED(INTERNAL·APPROVED/CONFIRMED) 슬롯에만 채워지는 동아리명이며
     * PENDING 은 신청 경쟁 정보라 항상 null 이다(2026-07-17 사용자 결정 §4⁗.1 — 승인 완료 예약은 학교 반영 후
     * 크롤 SCHOOL 행으로 어차피 실명 공개되므로 새 정보가 아님, PENDING 만 비노출 유지). soft-delete 된 동아리는
     * 이름을 못 찾아 null 로 내려가고 FE 는 '예약됨' 폴백을 쓴다.
     */
    public record BookingSlice(LocalDate date, LocalTime start, LocalTime end,
                               BookingStatus status, String organization) {}

    public static List<DayAvailability> assembleDays(YearMonth month, LocalDate today, LocalTime nowTime,
                                                     List<CrawlSlice> crawlSlices, List<BookingSlice> bookingSlices) {
        List<DayAvailability> days = new ArrayList<>(month.lengthOfMonth());
        for (int dayOfMonth = 1; dayOfMonth <= month.lengthOfMonth(); dayOfMonth++) {
            LocalDate date = month.atDay(dayOfMonth);
            days.add(assembleDay(date, today, nowTime, crawlSlices, bookingSlices));
        }
        return days;
    }

    private static DayAvailability assembleDay(LocalDate date, LocalDate today, LocalTime nowTime,
                                               List<CrawlSlice> crawlSlices, List<BookingSlice> bookingSlices) {
        List<CrawlSlice> crawledReservations = crawlSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.type() == CrawlRowType.CRAWLED_RESERVATION)
                .toList();
        List<CrawlSlice> basicSecured = crawlSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.type() == CrawlRowType.BASIC_SECURED_TIME)
                .toList();
        List<BookingSlice> blockedBookings = bookingSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.status().blocksSlot())
                .toList();
        List<BookingSlice> pendingBookings = bookingSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.status() == BookingStatus.PENDING)
                .toList();

        List<SlotAvailability> slots = new ArrayList<>(SLOT_COUNT);
        int availableCount = 0;
        for (int index = 0; index < SLOT_COUNT; index++) {
            LocalTime slotStart = OPEN_TIME.plusHours(index);
            LocalTime slotEnd = slotStart.plusHours(1);
            SlotAvailability slot = resolveSlot(date, today, nowTime, slotStart, slotEnd,
                    crawledReservations, basicSecured, blockedBookings, pendingBookings);
            if (slot.status() == SlotStatus.AVAILABLE || slot.status() == SlotStatus.PENDING_HOLD) {
                availableCount++;
            }
            slots.add(slot);
        }

        DayStatus dayStatus = date.isBefore(today) ? DayStatus.PAST
                : availableCount == 0 ? DayStatus.FULL
                : DayStatus.AVAILABLE;
        // operatingNotes 는 항상 빈 배열 — 비차단 운영행 개념 폐지(구 FE 스큐 호환용 계약 유지, 제거는 후속).
        return new DayAvailability(date, dayStatus, availableCount, List.of(), slots);
    }

    private static SlotAvailability resolveSlot(LocalDate date, LocalDate today, LocalTime nowTime,
                                                LocalTime slotStart, LocalTime slotEnd,
                                                List<CrawlSlice> crawledReservations, List<CrawlSlice> basicSecured,
                                                List<BookingSlice> blockedBookings,
                                                List<BookingSlice> pendingBookings) {
        String start = TIME_FORMAT.format(slotStart);
        String end = TIME_FORMAT.format(slotEnd);
        if (date.isBefore(today) || (date.isEqual(today) && !slotEnd.isAfter(nowTime))) {
            return new SlotAvailability(start, end, SlotStatus.PAST, null, null);
        }
        Optional<BookingSlice> internalBlock = blockedBookings.stream()
                .filter(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd))
                .findFirst();
        if (internalBlock.isPresent()) {
            // 내부 예약(APPROVED/CONFIRMED)은 승인 완료 상태라 학교 반영 후 크롤 SCHOOL 행으로 어차피 실명
            // 공개되므로 동아리명을 노출한다(2026-07-17 사용자 결정 §4⁗.1 — 구 비노출 정책 부분 반전).
            // organization 은 서비스가 blocksSlot 예약에만 주입하며, soft-delete 로 이름을 못 찾으면 null
            // (FE '예약됨' 폴백). PENDING 은 신청 경쟁 정보라 아래 PENDING_HOLD 분기에서 계속 비노출.
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.INTERNAL, internalBlock.get().organization());
        }
        Optional<CrawlSlice> schoolBlock = crawledReservations.stream()
                .filter(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd))
                .findFirst();
        if (schoolBlock.isPresent()) {
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.SCHOOL, schoolBlock.get().organization());
        }
        // 기본 확보 시간도 차단이다 — 실예약(SCHOOL)이 같은 슬롯에 공존하면 더 구체적인 실예약을 우선 표기.
        Optional<CrawlSlice> securedBlock = basicSecured.stream()
                .filter(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd))
                .findFirst();
        if (securedBlock.isPresent()) {
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.BASIC_SECURED, securedBlock.get().organization());
        }
        boolean pendingHold = pendingBookings.stream()
                .anyMatch(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd));
        if (pendingHold) {
            // 승인 대기 동아리명은 비노출(설계 §3.1 — 신청 경쟁 정보 최소화)
            return new SlotAvailability(start, end, SlotStatus.PENDING_HOLD, null, null);
        }
        return new SlotAvailability(start, end, SlotStatus.AVAILABLE, null, null);
    }

    private static boolean overlaps(LocalTime aStart, LocalTime aEnd, LocalTime bStart, LocalTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }
}
