package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayStatus;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.OperatingNote;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotBlockSource;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

/**
 * 가용성 슬롯 계산(설계 §3.1) — 순수 함수. 입력은 서비스가 크롤 엔티티·Booking 을 slice 로 매핑해 넣는다
 * (엔티티에 직접 의존하지 않아 단위 테스트가 쉽고, 판별 정책은 호출부의 FacilityAvailabilityPolicy 가 담당).
 *
 * <p>슬롯 판정 우선순위(공존 시 처리 순서): PAST → BLOCKED(INTERNAL) → BLOCKED(SCHOOL)
 * → PENDING_HOLD → AVAILABLE. 운영행(OPERATING)은 어떤 슬롯도 차단하지 않고 정보 라벨만 만든다.
 */
public final class FacilitySlotAssembler {

    public static final LocalTime OPEN_TIME = LocalTime.of(9, 0);
    public static final int SLOT_COUNT = 13; // 09~22시, 1시간 단위

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private FacilitySlotAssembler() {
    }

    /** 크롤 행 slice — type 은 FacilityAvailabilityPolicy 분류 결과. */
    public record CrawlSlice(LocalDate date, LocalTime start, LocalTime end, String organization,
                             CrawlRowType type, LocalTime operatingStart, LocalTime operatingEnd) {}

    /** 내부 예약 slice. 내부 예약은 상태만 필요, 동아리명은 공개 API 비노출 정책(BLOCKED(INTERNAL)·PENDING 모두). */
    public record BookingSlice(LocalDate date, LocalTime start, LocalTime end,
                               BookingStatus status) {}

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
        List<CrawlSlice> occupied = crawlSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.type() == CrawlRowType.OCCUPIED)
                .toList();
        List<CrawlSlice> operating = crawlSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.type() == CrawlRowType.OPERATING)
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
                    occupied, blockedBookings, pendingBookings);
            if (slot.status() == SlotStatus.AVAILABLE || slot.status() == SlotStatus.PENDING_HOLD) {
                availableCount++;
            }
            slots.add(slot);
        }

        DayStatus dayStatus = date.isBefore(today) ? DayStatus.PAST
                : availableCount == 0 ? DayStatus.FULL
                : DayStatus.AVAILABLE;
        return new DayAvailability(date, dayStatus, availableCount, operatingNotes(operating), slots);
    }

    private static SlotAvailability resolveSlot(LocalDate date, LocalDate today, LocalTime nowTime,
                                                LocalTime slotStart, LocalTime slotEnd,
                                                List<CrawlSlice> occupied, List<BookingSlice> blockedBookings,
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
            // 내부 예약(APPROVED/CONFIRMED)은 아직 학교 미반영 신청 정보 — 동아리명 비노출(2026-07-13 사용자 결정).
            // FE 는 blockedBy=INTERNAL 로만 '예약됨' 계열 일반 문구 표시. SCHOOL 분기 단체명은 공개 정보라 유지.
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.INTERNAL, null);
        }
        Optional<CrawlSlice> schoolBlock = occupied.stream()
                .filter(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd))
                .findFirst();
        if (schoolBlock.isPresent()) {
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.SCHOOL, schoolBlock.get().organization());
        }
        boolean pendingHold = pendingBookings.stream()
                .anyMatch(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd));
        if (pendingHold) {
            // 승인 대기 동아리명은 비노출(설계 §3.1 — 신청 경쟁 정보 최소화)
            return new SlotAvailability(start, end, SlotStatus.PENDING_HOLD, null, null);
        }
        return new SlotAvailability(start, end, SlotStatus.AVAILABLE, null, null);
    }

    private static List<OperatingNote> operatingNotes(List<CrawlSlice> operating) {
        // (단체, 운영시간) 단위로 dedupe — 운영행은 슬롯 마커가 여러 행으로 내려올 수 있다(선행 스펙 §16.1)
        LinkedHashSet<OperatingNote> notes = new LinkedHashSet<>();
        for (CrawlSlice slice : operating) {
            LocalTime noteStart = slice.operatingStart() != null ? slice.operatingStart() : slice.start();
            LocalTime noteEnd = slice.operatingEnd() != null ? slice.operatingEnd() : slice.end();
            notes.add(new OperatingNote(slice.organization(),
                    TIME_FORMAT.format(noteStart), TIME_FORMAT.format(noteEnd)));
        }
        return List.copyOf(notes);
    }

    private static boolean overlaps(LocalTime aStart, LocalTime aEnd, LocalTime bStart, LocalTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }
}
