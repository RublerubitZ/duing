package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.FeeAnomalyReport;
import com.duing.domain.fee.service.dto.query.FeeAnomalySeverity;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 이상징후 평가 결과(스펙 §7.9). {@code evaluatedAt} 은 평가 시각(절대시각)이고,
 * {@code window} 는 요청이 생략한 기본값까지 확정한 실제 평가 구간이다.
 *
 * <p>{@code anomalies} 에는 탐지된 Rule 만 심각도 내림차순으로 실린다 — 미탐지면 빈 배열이다.
 * {@code evidence} 는 Rule 마다 키가 다른 판정 근거(건수·비율·임계값)이며 개인정보는 담기지 않는다.
 */
public record AdminFeeAnomalyReportResponse(
        Instant evaluatedAt,
        Window window,
        List<Anomaly> anomalies
) {
    /** 평가에 실제로 쓰인 기간 (KST 날짜, to 포함). */
    public record Window(LocalDate from, LocalDate to) {
    }

    public record Anomaly(
            String ruleId,
            FeeAnomalySeverity severity,
            String title,
            String description,
            Map<String, Object> evidence
    ) {
    }

    public static AdminFeeAnomalyReportResponse from(FeeAnomalyReport report) {
        return new AdminFeeAnomalyReportResponse(
                report.evaluatedAt(),
                new Window(report.windowFrom(), report.windowTo()),
                report.anomalies().stream()
                        .map(anomaly -> new Anomaly(anomaly.ruleId(), anomaly.severity(), anomaly.title(),
                                anomaly.description(), anomaly.evidence()))
                        .toList());
    }
}
