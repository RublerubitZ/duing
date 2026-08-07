package com.duing.domain.fee.service.dto.query;

import java.time.LocalDateTime;
import java.util.Map;

/** 감사 콘솔 전체 현황 KPI(스펙 §7.2). 목록과 같은 병합 결과를 합산해 산출한다. */
public record AdminFeeDashboardQuery(
        long clubCount, long feeUsingClubCount,
        long totalBilled, long totalPaid, long totalOutstanding, double collectionRate,
        long openOpinionCount, RecentActivity recentActivity
) {
    /**
     * 오늘(KST 자정 이후) 플랫폼 전체에서 일어난 회비 변경 요약.
     * {@code since} 는 created_at 과 같은 JVM 존 벽시계이고, 응답 경계에서 Instant 로 환산한다.
     * {@code eventCounts} 는 GROUP BY 결과 그대로라 0 건인 종류는 키가 없다.
     */
    public record RecentActivity(LocalDateTime since, Map<String, Long> eventCounts, long newOpinionCount) {
    }
}
