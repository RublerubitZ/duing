package com.duing.domain.facilitysubmission.service.dto.query;

/** Summary 카드 4종(스펙 §5.1) — bookings 와 동일 필터 범위에서 집계한다. */
public record SubmissionSummaryCounts(
        long approvedCount,
        long awaitingCount,
        long submittedCount,
        long confirmedCount
) {
}
