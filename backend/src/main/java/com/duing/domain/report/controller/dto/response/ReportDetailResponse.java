package com.duing.domain.report.controller.dto.response;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.service.dto.query.ReportAdminDetailQuery;
import java.time.LocalDateTime;

public record ReportDetailResponse(
        Long id,
        UserRef reporter,
        ReportTargetType targetType,
        Long targetId,
        String targetLabel,
        ReportReasonCode reasonCode,
        String detail,
        ReportStatus status,
        String actionNote,
        UserRef handledBy,
        LocalDateTime handledAt,
        LocalDateTime createdAt
) {
    public record UserRef(Long id, String name) {}

    public static ReportDetailResponse of(Report report, String targetLabel,
                                          UserRef reporter, UserRef handler) {
        return new ReportDetailResponse(
                report.getId(), reporter,
                report.getTargetType(), report.getTargetId(), targetLabel,
                report.getReasonCode(), report.getDetail(),
                report.getStatus(), report.getActionNote(),
                handler, report.getHandledAt(), report.getCreatedAt()
        );
    }

    public static ReportDetailResponse from(ReportAdminDetailQuery query) {
        UserRef reporter = query.reporter() != null
                ? new UserRef(query.reporter().id(), query.reporter().name())
                : null;
        UserRef handler = query.handler() != null
                ? new UserRef(query.handler().id(), query.handler().name())
                : null;
        return of(query.report(), query.targetLabel(), reporter, handler);
    }
}
