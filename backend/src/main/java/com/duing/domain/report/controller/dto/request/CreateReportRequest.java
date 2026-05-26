package com.duing.domain.report.controller.dto.request;

import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.service.dto.command.CreateReportCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateReportRequest(
        @NotNull(message = "신고 대상 종류는 필수입니다.") ReportTargetType targetType,
        @NotNull(message = "신고 대상 ID는 필수입니다.") @Positive Long targetId,
        @NotNull(message = "신고 사유 코드는 필수입니다.") ReportReasonCode reasonCode,
        @Size(max = 1000, message = "신고 상세는 1000자 이하여야 합니다.") String detail
) {
    public CreateReportCommand toCommand(Long reporterId) {
        return new CreateReportCommand(reporterId, targetType, targetId, reasonCode, detail);
    }
}
