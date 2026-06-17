package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.service.dto.command.RecordPaymentCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record RecordPaymentRequest(
        @NotNull(message = "납부 금액은 필수입니다.")
        @Positive(message = "납부 금액은 0보다 커야 합니다.")
        Long amount,

        @NotNull(message = "납부 수단은 필수입니다.")
        PaymentMethod method,

        @NotNull(message = "납부일은 필수입니다.")
        LocalDate paidAt,

        @Size(max = 200, message = "메모는 200자를 넘을 수 없습니다.")
        String memo
) {
    public RecordPaymentCommand toCommand(Long clubId, Long actorId, Long billId) {
        return new RecordPaymentCommand(clubId, actorId, billId, amount, method, paidAt, memo);
    }
}
