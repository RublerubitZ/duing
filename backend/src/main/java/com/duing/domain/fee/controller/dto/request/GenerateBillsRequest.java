package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

public record GenerateBillsRequest(
        @NotBlank(message = "회차 라벨은 필수입니다.") String billingPeriod,
        LocalDate billingStartDate,
        LocalDate billingEndDate,
        LocalDate dueDate
) {
    public GenerateBillsCommand toCommand(Long clubId, Long actorId, Long policyId) {
        return new GenerateBillsCommand(clubId, actorId, policyId,
                billingPeriod, billingStartDate, billingEndDate, dueDate);
    }
}
