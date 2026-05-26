package com.duing.domain.report.service.dto.command;

import com.duing.domain.report.entity.ReportStatus;

public record ProcessReportCommand(
        Long reportId,
        Long handlerUserId,
        ReportStatus status,
        String actionNote
) {}
