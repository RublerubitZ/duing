package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.FeeBillSummary;

public record FeeSummaryResponse(
        long totalBilled,
        long totalPaid,
        long outstanding,
        double collectionRate,
        long billCount,
        long pendingCount,
        long partialPaidCount,
        long overdueCount,
        long paidCount
) {
    public static FeeSummaryResponse from(FeeBillSummary summary) {
        return new FeeSummaryResponse(
                summary.totalBilled(),
                summary.totalPaid(),
                summary.outstanding(),
                summary.collectionRate(),
                summary.billCount(),
                summary.pendingCount(),
                summary.partialPaidCount(),
                summary.overdueCount(),
                summary.paidCount());
    }
}
