package com.duing.domain.report.service.dto.query;

import com.duing.domain.report.entity.Report;

public record ReportAdminSummaryQuery(
        Report report,
        String targetLabel
) {}
