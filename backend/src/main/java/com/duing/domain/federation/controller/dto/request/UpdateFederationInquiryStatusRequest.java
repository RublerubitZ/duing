package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.command.ChangeInquiryStatusCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateFederationInquiryStatusRequest(
        @NotNull(message = "변경할 상태는 필수 입력값입니다.")
        FederationInquiryStatus status,
        Long version,   // IN_PROGRESS 전이 시 필수(서비스 검증 — stale-render 방어)
        @Size(max = 200, message = "종료 사유는 200자 이하여야 합니다.")
        String closedReason
) {
    public ChangeInquiryStatusCommand toCommand(Long inquiryId) {
        return new ChangeInquiryStatusCommand(inquiryId, status, version, closedReason);
    }
}
