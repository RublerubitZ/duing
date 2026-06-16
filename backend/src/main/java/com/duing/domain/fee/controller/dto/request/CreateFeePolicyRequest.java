package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.service.dto.command.CreateFeePolicyCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record CreateFeePolicyRequest(
        @NotBlank(message = "정책 이름은 필수입니다.") @Size(max = 100, message = "정책 이름은 100자 이하여야 합니다.") String name,
        @NotNull(message = "금액은 필수입니다.") @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") Long amount,
        @NotNull(message = "회비 유형은 필수입니다.") BillingType billingType) {

    public CreateFeePolicyCommand toCommand(Long clubId, Long actorId) {
        return new CreateFeePolicyCommand(clubId, actorId, name, amount, billingType);
    }
}
