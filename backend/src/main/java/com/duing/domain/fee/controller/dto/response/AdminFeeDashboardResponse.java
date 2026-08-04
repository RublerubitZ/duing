package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.AdminFeeDashboardQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.Map;

/**
 * 감사 콘솔 전체 현황 KPI(스펙 §7.2).
 *
 * <p>{@code openOpinionCount} 는 전 동아리에서 아직 열려 있는 감사 의견 수이고,
 * {@code recentActivity} 는 전역 기간 필터와 무관하게 항상 KST 오늘 00:00 이후를 본다.
 */
public record AdminFeeDashboardResponse(
        long clubCount,
        long feeUsingClubCount,
        long totalBilled,
        long totalPaid,
        long totalOutstanding,
        double collectionRate,
        long openOpinionCount,
        RecentActivity recentActivity
) {
    /**
     * 오늘의 변경 요약. {@code eventCounts} 는 회비 변경 이벤트 타입별 건수이고
     * 총동연 열람 이벤트는 세지 않는다 — 0 건인 종류는 키 자체가 없다.
     */
    public record RecentActivity(Instant since, Map<String, Long> eventCounts, long newOpinionCount) {
    }

    public static AdminFeeDashboardResponse from(AdminFeeDashboardQuery dashboardQuery) {
        AdminFeeDashboardQuery.RecentActivity activity = dashboardQuery.recentActivity();
        return new AdminFeeDashboardResponse(
                dashboardQuery.clubCount(),
                dashboardQuery.feeUsingClubCount(),
                dashboardQuery.totalBilled(),
                dashboardQuery.totalPaid(),
                dashboardQuery.totalOutstanding(),
                dashboardQuery.collectionRate(),
                dashboardQuery.openOpinionCount(),
                new RecentActivity(
                        TimeMapper.systemWallClockToInstant(activity.since()),
                        activity.eventCounts(),
                        activity.newOpinionCount()));
    }
}
