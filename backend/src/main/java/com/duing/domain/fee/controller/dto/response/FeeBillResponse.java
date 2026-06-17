package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.service.dto.query.FeeBillQuery;
import java.time.LocalDate;

public record FeeBillResponse(
        Long id,
        Long clubId,
        Long userId,
        Long feePolicyId,
        Long amount,
        String billingPeriod,
        LocalDate billingStartDate,
        LocalDate billingEndDate,
        LocalDate dueDate,
        FeeStatus status,
        Long paidAmount,
        Long remainingAmount
) {
    public static FeeBillResponse from(FeeBillQuery query) {
        return new FeeBillResponse(
                query.id(),
                query.clubId(),
                query.userId(),
                query.feePolicyId(),
                query.amount(),
                query.billingPeriod(),
                query.billingStartDate(),
                query.billingEndDate(),
                query.dueDate(),
                query.status(),
                query.paidAmount(),
                query.remainingAmount());
    }
}
