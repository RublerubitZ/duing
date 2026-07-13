package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService.BookingSummaryResult;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record FacilityBookingSummaryResponse(
        Long bookingId, Long facilityId, String roomName,
        LocalDate date, LocalTime startTime, LocalTime endTime,
        BookingStatus status, String purpose, LocalDateTime createdAt
) {
    public static FacilityBookingSummaryResponse from(BookingSummaryResult result) {
        return new FacilityBookingSummaryResponse(result.bookingId(), result.facilityId(), result.roomName(),
                result.date(), result.startTime(), result.endTime(), result.status(),
                result.purpose(), result.createdAt());
    }
}
