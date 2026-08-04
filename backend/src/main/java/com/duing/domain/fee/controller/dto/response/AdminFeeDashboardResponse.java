package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.AdminFeeDashboardQuery;

/**
 * 감사 콘솔 전체 현황 KPI(스펙 §7.2).
 *
 * <p>{@code openOpinionCount}·{@code recentActivity} 는 감사 의견 테이블(V106)에 종속되므로
 * 그 테이블이 생기는 PR-3 에서 더한다.
 */
public record AdminFeeDashboardResponse(
        long clubCount,
        long feeUsingClubCount,
        long totalBilled,
        long totalPaid,
        long totalOutstanding,
        double collectionRate
) {
    public static AdminFeeDashboardResponse from(AdminFeeDashboardQuery dashboardQuery) {
        return new AdminFeeDashboardResponse(
                dashboardQuery.clubCount(),
                dashboardQuery.feeUsingClubCount(),
                dashboardQuery.totalBilled(),
                dashboardQuery.totalPaid(),
                dashboardQuery.totalOutstanding(),
                dashboardQuery.collectionRate());
    }
}
