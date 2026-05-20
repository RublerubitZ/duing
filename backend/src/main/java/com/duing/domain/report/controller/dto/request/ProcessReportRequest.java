package com.duing.domain.report.controller.dto.request;

import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.service.dto.command.ProcessReportCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessReportRequest(
        @NotNull(message = "처리 결과 상태는 필수입니다.") ReportStatus status,
        @Size(max = 1000, message = "처리 메모는 1000자 이하여야 합니다.") String actionNote
) {
    public ProcessReportCommand toCommand(Long reportId, Long handlerUserId) {
        return new ProcessReportCommand(reportId, handlerUserId, status, actionNote);
    }
}
