package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.service.dto.command.VoidPaymentCommand;
import jakarta.validation.constraints.Size;

public record VoidPaymentRequest(
        @Size(max = 200, message = "정정 사유는 200자를 넘을 수 없습니다.")
        String reason
) {
    public VoidPaymentCommand toCommand(Long clubId, Long actorId, Long billId, Long paymentId) {
        return new VoidPaymentCommand(clubId, actorId, billId, paymentId, reason);
    }
}
