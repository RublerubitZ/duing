package com.duing.domain.facilitybooking.service.dto.query;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDate;

public record AdminBookingSearchCondition(
        BookingStatus status,
        Long facilityId,
        LocalDate dateFrom,
        LocalDate dateTo,
        AdminBookingQueueSort sort
) {}
