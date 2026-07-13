package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.AdminBookingSummaryResult;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record AdminFacilityBookingSummaryResponse(
        Long bookingId, Long clubId, String clubName,
        Long facilityId, String roomName,
        LocalDate date, LocalTime startTime, LocalTime endTime,
        BookingStatus status, String purpose, LocalDateTime createdAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer approvedWaitingDays,
        boolean conflictSuspected
) {
    public static AdminFacilityBookingSummaryResponse from(AdminBookingSummaryResult result) {
        return new AdminFacilityBookingSummaryResponse(result.bookingId(), result.clubId(), result.clubName(),
                result.facilityId(), result.roomName(), result.date(), result.startTime(), result.endTime(),
                result.status(), result.purpose(), result.createdAt(),
                result.approvedWaitingDays(), result.conflictSuspected());
    }
}
