package com.duing.domain.report.service.dto.query;

import com.duing.domain.report.entity.Report;

public record ReportAdminDetailQuery(
        Report report,
        String targetLabel,
        UserRef reporter,
        UserRef handler
) {
    public record UserRef(Long id, String name) {}
}
