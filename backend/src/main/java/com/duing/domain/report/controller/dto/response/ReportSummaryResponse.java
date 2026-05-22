package com.duing.domain.report.controller.dto.response;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.service.dto.query.ReportAdminSummaryQuery;
import java.time.LocalDateTime;

public record ReportSummaryResponse(
        Long id,
        ReportTargetType targetType,
        Long targetId,
        String targetLabel,
        ReportReasonCode reasonCode,
        ReportStatus status,
        LocalDateTime createdAt
) {
    public static ReportSummaryResponse of(Report report, String targetLabel) {
        return new ReportSummaryResponse(
                report.getId(), report.getTargetType(), report.getTargetId(),
                targetLabel, report.getReasonCode(), report.getStatus(),
                report.getCreatedAt()
        );
    }

    public static ReportSummaryResponse from(ReportAdminSummaryQuery query) {
        return of(query.report(), query.targetLabel());
    }
}
