package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService.CreateResult;

public record CreateFacilityBookingResponse(Long bookingId, BookingStatus status, long overlappingPendingCount) {
    public static CreateFacilityBookingResponse from(CreateResult result) {
        return new CreateFacilityBookingResponse(result.bookingId(), BookingStatus.PENDING,
                result.overlappingPendingCount());
    }
}
