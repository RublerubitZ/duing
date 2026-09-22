package com.duing.domain.facilitybooking.service.dto.query;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDate;

public record AdminBookingSearchCondition(
        BookingStatus status,
        Long facilityId,
        LocalDate dateFrom,
        LocalDate dateTo,
        AdminBookingQueueSort sort
) {
    /** sort 는 switch 로 분기하므로 null 을 DEFAULT 로 접는다(컨트롤러 defaultValue 와 같은 뜻). */
    public AdminBookingSearchCondition {
        sort = sort == null ? AdminBookingQueueSort.DEFAULT : sort;
    }
}
