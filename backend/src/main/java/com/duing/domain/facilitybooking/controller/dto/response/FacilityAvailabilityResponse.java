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

    public enum SlotStatus { AVAILABLE, PENDING_HOLD, BLOCKED, PAST }

    /** BASIC_SECURED = 총동연 지정 기본 확보 시간 대상 동아리의 크롤 예약 — 차단은 SCHOOL 과 동일, 표시만 구분. */
    public enum SlotBlockSource { SCHOOL, INTERNAL, BASIC_SECURED }

    public record DayAvailability(
            LocalDate date,
            DayStatus dayStatus,
            int availableSlotCount,
            List<OperatingNote> operatingNotes,
            List<SlotAvailability> slots
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
