package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record GenerateBillsRequest(
        @NotBlank(message = "회차 라벨은 필수입니다.") String billingPeriod,
        LocalDate billingStartDate,
        LocalDate billingEndDate,
        LocalDate dueDate,
        @Size(max = 500, message = "청구 대상은 최대 500명까지 지정할 수 있습니다.") List<Long> memberIds
) {
    public GenerateBillsCommand toCommand(Long clubId, Long actorId, Long policyId) {
        return new GenerateBillsCommand(clubId, actorId, policyId,
                billingPeriod, billingStartDate, billingEndDate, dueDate, memberIds);
    }
}
