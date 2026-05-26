package com.duing.domain.report.service.dto.query;

import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;

public record ReportAdminSearchCondition(
        ReportStatus status,
        ReportTargetType targetType
) {}
