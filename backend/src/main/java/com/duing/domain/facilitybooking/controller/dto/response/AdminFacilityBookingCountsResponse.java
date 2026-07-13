package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.AdminBookingSummaryCounts;

public record AdminFacilityBookingCountsResponse(
        long pendingCount, long todaySubmittedCount,
        long approvedWaitingCount, long oldestApprovedWaitingDays,
        long conflictCount, long confirmedThisMonthCount
) {
    public static AdminFacilityBookingCountsResponse from(AdminBookingSummaryCounts counts) {
        return new AdminFacilityBookingCountsResponse(counts.pendingCount(), counts.todaySubmittedCount(),
                counts.approvedWaitingCount(), counts.oldestApprovedWaitingDays(),
                counts.conflictCount(), counts.confirmedThisMonthCount());
    }
}
