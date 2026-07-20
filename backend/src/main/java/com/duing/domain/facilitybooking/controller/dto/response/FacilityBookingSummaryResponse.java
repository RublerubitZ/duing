package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService.BookingSummaryResult;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

public record FacilityBookingSummaryResponse(
        Long bookingId, Long facilityId, String roomName,
        LocalDate date, LocalTime startTime, LocalTime endTime,
        BookingStatus status, String purpose, Instant createdAt
) {
    public static FacilityBookingSummaryResponse from(BookingSummaryResult result) {
        return new FacilityBookingSummaryResponse(result.bookingId(), result.facilityId(), result.roomName(),
                result.date(), result.startTime(), result.endTime(), result.status(),
                result.purpose(), TimeMapper.systemWallClockToInstant(result.createdAt()));
    }
}
