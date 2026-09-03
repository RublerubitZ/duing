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
 * 가용성 슬롯 계산(전면 차단 설계 §3.3) — 순수 함수. 입력은 서비스가 크롤 엔티티·Booking 을 slice 로 매핑해
 * 넣는다(엔티티에 직접 의존하지 않아 단위 테스트가 쉽고, 판별 정책은 호출부의 FacilityAvailabilityPolicy 가 담당).
 *
 * <p>크롤 slice 는 실예약 분류(CRAWLED_RESERVATION)만 차단한다 — 기본 확보 시간(BASIC_SECURED_TIME)은
 * 비차단이라 다른 동아리가 그 시간대를 신청할 수 있다(2026-08-27 비차단 전환). 슬롯 판정 우선순위(공존 시 표시 순서):
 * BLOCKED(INTERNAL) → BLOCKED(SCHOOL) → PAST → PENDING_HOLD → DEADLINE_PASSED → AVAILABLE.
 * 점유(BLOCKED)가 PAST 보다 앞이라 지난 시간대·직전 월 날짜에서도 "누가 예약했는지"가 기록으로 보존되고(2026-09-03
 * 직전 월 열람), DEADLINE_PASSED(사용일 전날 12:00 KST 경과, BookingDeadlinePolicy.isPassed 공유)는 빈 슬롯에만 붙는다.
 * operatingNotes 는 확보(BASIC_SECURED_TIME) 슬라이스의 (단체, 시작, 끝) distinct 나열이다 —
 * 표시 전용, 차단 아님(v2 스펙 §3).
 */
public final class FacilitySlotAssembler {

    public static final LocalTime OPEN_TIME = LocalTime.of(9, 0);
    public static final int SLOT_COUNT = 13; // 09~22시, 1시간 단위

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private FacilitySlotAssembler() {
    }

    /** 크롤 행 slice — type 은 FacilityAvailabilityPolicy 분류 결과(실예약만 차단, 확보 시간은 비차단). */
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
        // 확보 분류는 표시 전용 — 차단 아님(v2 스펙 §3). 슬롯 판정에는 관여하지 않고 operatingNotes 소스로만 쓴다.
        List<CrawlSlice> basicSecuredTimes = crawlSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.type() == CrawlRowType.BASIC_SECURED_TIME)
                .toList();
        List<BookingSlice> blockedBookings = bookingSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.status().blocksSlot())
                .toList();
        List<BookingSlice> pendingBookings = bookingSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.status() == BookingStatus.PENDING)
                .toList();

        // 신청 마감(사용일 전날 12:00 KST) — 날짜당 1회 판정. 신청 생성 검증(BookingApplicationPolicy)과 같은 순수 규칙을 공유한다.
        boolean deadlinePassed = BookingDeadlinePolicy.isPassed(date, today.atTime(nowTime));

        List<SlotAvailability> slots = new ArrayList<>(SLOT_COUNT);
        int availableCount = 0;
        for (int index = 0; index < SLOT_COUNT; index++) {
            LocalTime slotStart = OPEN_TIME.plusHours(index);
            LocalTime slotEnd = slotStart.plusHours(1);
            SlotAvailability slot = resolveSlot(date, today, nowTime, deadlinePassed, slotStart, slotEnd,
                    crawledReservations, blockedBookings, pendingBookings);
            // 마감된 날의 대기 슬롯은 새 신청 대상이 아니므로 세지 않는다 — 월간 셀이 FULL("마감")로 수렴한다.
            if (slot.status() == SlotStatus.AVAILABLE
                    || (slot.status() == SlotStatus.PENDING_HOLD && !deadlinePassed)) {
                availableCount++;
            }
            slots.add(slot);
        }

        DayStatus dayStatus = date.isBefore(today) ? DayStatus.PAST
                : availableCount == 0 ? DayStatus.FULL
                : DayStatus.AVAILABLE;
        // 날짜 단위 마감 플래그 — 오늘 이후 & 마감 경과. 지난 날짜는 열람 전용이라 false(스펙 §9.1).
        boolean applicationClosed = !date.isBefore(today) && deadlinePassed;
        return new DayAvailability(date, dayStatus, availableCount, operatingNotes(basicSecuredTimes), slots,
                applicationClosed);
    }

    /**
     * 확보 슬라이스의 (단체, 시작, 끝)을 행 단위 distinct 로 나열한다 — 표시 전용, 차단 아님(v2 스펙 §3).
     * 인접 구간 병합은 하지 않는다(main 의 다중 노트 나열 동작과 동등).
     */
    private static List<OperatingNote> operatingNotes(List<CrawlSlice> basicSecuredTimes) {
        LinkedHashSet<OperatingNote> notes = new LinkedHashSet<>();
        for (CrawlSlice slice : basicSecuredTimes) {
            notes.add(new OperatingNote(slice.organization(),
                    TIME_FORMAT.format(slice.start()), TIME_FORMAT.format(slice.end())));
        }
        return List.copyOf(notes);
    }

    private static SlotAvailability resolveSlot(LocalDate date, LocalDate today, LocalTime nowTime,
                                                boolean deadlinePassed,
                                                LocalTime slotStart, LocalTime slotEnd,
                                                List<CrawlSlice> crawledReservations,
                                                List<BookingSlice> blockedBookings,
                                                List<BookingSlice> pendingBookings) {
        String start = TIME_FORMAT.format(slotStart);
        String end = TIME_FORMAT.format(slotEnd);
        // 점유 정보가 최우선 — 지난 시간대·마감된 날에도 "누가 예약했는지"는 기록으로 보존한다(직전 월 열람 스펙 §2.3).
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
        if (date.isBefore(today) || (date.isEqual(today) && !slotEnd.isAfter(nowTime))) {
            return new SlotAvailability(start, end, SlotStatus.PAST, null, null);
        }
        // 기본 확보 시간(BASIC_SECURED_TIME)은 비차단 — 여기까지 오면 확보 구간이라도 PENDING_HOLD/AVAILABLE 로 내려간다.
        boolean pendingHold = pendingBookings.stream()
                .anyMatch(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd));
        if (pendingHold) {
            // 승인 대기 동아리명은 비노출(설계 §3.1 — 신청 경쟁 정보 최소화). 마감된 날에도 대기 상태를 유지한다(§0-2).
            return new SlotAvailability(start, end, SlotStatus.PENDING_HOLD, null, null);
        }
        // 빈 슬롯만 마감 판정 — 점유·대기 슬롯은 위에서 이미 돌아갔다.
        if (deadlinePassed) {
            return new SlotAvailability(start, end, SlotStatus.DEADLINE_PASSED, null, null);
        }
        return new SlotAvailability(start, end, SlotStatus.AVAILABLE, null, null);
    }

    private static boolean overlaps(LocalTime aStart, LocalTime aEnd, LocalTime bStart, LocalTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }
}
