package com.duing.domain.fee.service.dto.query;

public record FeeBillSummary(
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
}
