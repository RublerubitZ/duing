package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.AdminBookingSummaryCounts;
import com.duing.global.time.TimeMapper;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

public record AdminFacilityBookingCountsResponse(
        long pendingCount, long todaySubmittedCount, long oldestPendingWaitingDays,
        long approvedWaitingCount, long oldestApprovedWaitingDays,
        long conflictCount, long conflictSuspectedCount, long confirmedThisMonthCount,
        // 당월 크롤 마지막 수집 시각(개편 스펙 A1) — 스냅샷 부재 시 null(FE 는 칩 생략 폴백).
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant crawledAt
) {
    public static AdminFacilityBookingCountsResponse from(AdminBookingSummaryCounts counts) {
        return new AdminFacilityBookingCountsResponse(counts.pendingCount(), counts.todaySubmittedCount(),
                counts.oldestPendingWaitingDays(), counts.approvedWaitingCount(), counts.oldestApprovedWaitingDays(),
                counts.conflictCount(), counts.conflictSuspectedCount(), counts.confirmedThisMonthCount(),
                TimeMapper.seoulWallClockToInstant(counts.crawledAt()));
    }
}
