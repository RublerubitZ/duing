package com.duing.domain.report.service.dto.command;

import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportTargetType;

public record CreateReportCommand(
        Long reporterId,
        ReportTargetType targetType,
        Long targetId,
        ReportReasonCode reasonCode,
        String detail
) {}
