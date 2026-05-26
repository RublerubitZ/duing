package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessPromotionRequestRequest(
        @NotNull(message = "처리 결과 상태는 필수입니다.") PromotionRequestStatus status,
        @Size(max = 1000, message = "처리 메모는 1000자 이하여야 합니다.") String actionNote
) {
    public ProcessPromotionRequestCommand toCommand(Long requestId, Long handlerAdminId) {
        return new ProcessPromotionRequestCommand(requestId, handlerAdminId, status, actionNote);
    }
}
