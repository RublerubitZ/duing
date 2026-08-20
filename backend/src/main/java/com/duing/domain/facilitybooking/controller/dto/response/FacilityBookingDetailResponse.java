package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService.BookingDetailResult;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record FacilityBookingDetailResponse(
        Long bookingId, Long facilityId, String roomName,
        LocalDate date, LocalTime startTime, LocalTime endTime,
        BookingStatus status, String purpose,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer attendeeCount,
        String contactPhone,
        @JsonInclude(JsonInclude.Include.NON_NULL) String rejectReason,
        @JsonInclude(JsonInclude.Include.NON_NULL) String conflictDetail,
        List<BookingHistoryItemResponse> history
) {

    public static FacilityBookingDetailResponse from(BookingDetailResult result) {
        return new FacilityBookingDetailResponse(result.bookingId(), result.facilityId(), result.roomName(),
                result.date(), result.startTime(), result.endTime(), result.status(), result.purpose(),
                result.attendeeCount(), result.contactPhone(), result.rejectReason(), result.conflictDetail(),
                result.history().stream().map(BookingHistoryItemResponse::from).toList());
    }
}
