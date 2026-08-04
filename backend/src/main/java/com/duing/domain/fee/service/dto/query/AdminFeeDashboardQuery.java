package com.duing.domain.fee.service.dto.query;

/** 감사 콘솔 전체 현황 KPI(스펙 §7.2). 목록과 같은 병합 결과를 합산해 산출한다. */
public record AdminFeeDashboardQuery(
        long clubCount, long feeUsingClubCount,
        long totalBilled, long totalPaid, long totalOutstanding, double collectionRate
) {
}
