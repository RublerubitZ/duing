package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import java.time.LocalDate;

public record FeeBillQuery(
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
    public static FeeBillQuery from(FeeBill bill, long paidAmount) {
        return new FeeBillQuery(
                bill.getId(),
                bill.getClubId(),
                bill.getUserId(),
                bill.getFeePolicyId(),
                bill.getAmount(),
                bill.getBillingPeriod(),
                bill.getBillingStartDate(),
                bill.getBillingEndDate(),
                bill.getDueDate(),
                bill.getStatus(),
                paidAmount,
                bill.remainingAfter(paidAmount));
    }
}
