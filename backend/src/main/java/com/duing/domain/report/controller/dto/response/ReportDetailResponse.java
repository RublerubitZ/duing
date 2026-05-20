package com.duing.domain.report.controller.dto.response;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
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
}
