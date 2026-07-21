package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.AdminBookingSummaryResult;
import com.duing.global.time.TimeMapper;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

public record AdminFacilityBookingSummaryResponse(
        Long bookingId, Long clubId, String clubName,
        Long facilityId, String roomName,
        LocalDate date, LocalTime startTime, LocalTime endTime,
        BookingStatus status, String purpose,
        // 큐 테이블 인원 표기(개편 스펙 A2) — 선택 입력이라 null 허용(상세 응답과 동일 규칙).
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer attendeeCount,
        String contactPhone, Instant createdAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer approvedWaitingDays,
        boolean conflictSuspected, boolean partiallyMatched
) {
    public static AdminFacilityBookingSummaryResponse from(AdminBookingSummaryResult result) {
        return new AdminFacilityBookingSummaryResponse(result.bookingId(), result.clubId(), result.clubName(),
                result.facilityId(), result.roomName(), result.date(), result.startTime(), result.endTime(),
                result.status(), result.purpose(), result.attendeeCount(), result.contactPhone(),
                TimeMapper.systemWallClockToInstant(result.createdAt()),
                result.approvedWaitingDays(), result.conflictSuspected(), result.partiallyMatched());
    }
}
