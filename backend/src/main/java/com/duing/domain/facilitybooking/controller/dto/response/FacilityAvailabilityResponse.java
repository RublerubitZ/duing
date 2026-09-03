package com.duing.domain.facilitybooking.controller.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** 월 단위 가용성(설계 §8.1). 시간은 "HH:mm", yearMonth 는 "yyyy-MM" 문자열. */
public record FacilityAvailabilityResponse(
        Long facilityId,
        String yearMonth,
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant lastUpdatedAt,
        boolean stale,
        LocalDate bookableFrom,
        LocalDate bookableUntil,
        List<DayAvailability> days
) {

    public enum DayStatus { AVAILABLE, FULL, PAST }

    /**
     * DEADLINE_PASSED = 신청 마감(사용일 전날 12:00 KST 경과, BookingDeadlinePolicy 와 동일 경계). 빈 슬롯에만 부여하며
     * 점유 슬롯은 BLOCKED·PENDING_HOLD 를 유지한다. PAST 는 이미 지난 시간대(지난 날짜 포함)의 빈 슬롯.
     */
    public enum SlotStatus { AVAILABLE, PENDING_HOLD, BLOCKED, PAST, DEADLINE_PASSED }

    /** SCHOOL = 크롤 실예약, INTERNAL = 내부 승인 예약. 기본 확보 시간은 비차단이라 blockedBy 로 내려가지 않는다(2026-08-27). */
    public enum SlotBlockSource { SCHOOL, INTERNAL }

    /**
     * applicationClosed = 신청 마감된 날(오늘 이후이면서 사용일 전날 12:00 KST 경과). 빈 슬롯이 하나도 없어
     * DEADLINE_PASSED 슬롯이 없는 날도 true 라 FE 가 날짜 단위로 게이팅한다. 지난 날짜는 false — 열람 전용이라
     * 마감 안내 대상이 아니고 선택 가능한 슬롯도 없다. 2026-09-03 스펙 §9.1(가산 필드, 맨 뒤).
     */
    public record DayAvailability(
            LocalDate date,
            DayStatus dayStatus,
            int availableSlotCount,
            List<OperatingNote> operatingNotes,
            List<SlotAvailability> slots,
            boolean applicationClosed
    ) {}

    public record SlotAvailability(
            String start,
            String end,
            SlotStatus status,
            @JsonInclude(JsonInclude.Include.NON_NULL) SlotBlockSource blockedBy,
            @JsonInclude(JsonInclude.Include.NON_NULL) String organization
    ) {}

    public record OperatingNote(String organization, String start, String end) {}
}
