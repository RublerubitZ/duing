package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.service.dto.query.FeeBillQuery;
import java.time.LocalDate;

public record MyFeeResponse(
        Long id,
        Long clubId,
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
    public static MyFeeResponse from(FeeBillQuery query) {
        return new MyFeeResponse(
                query.id(),
                query.clubId(),
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
