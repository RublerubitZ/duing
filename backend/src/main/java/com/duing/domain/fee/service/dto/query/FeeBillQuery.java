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
        FeeStatus displayStatus,
        Long paidAmount,
        Long remainingAmount
) {
    /** paidAmount 는 ACTIVE 납부 합계, today 는 seoulClock 기준 오늘 — displayStatus(표기 축) 파생에 쓴다. */
    public static FeeBillQuery from(FeeBill bill, long paidAmount, LocalDate today) {
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
                FeeStatus.resolveDisplay(bill.getStatus(), bill.getAmount(), bill.getDueDate(), paidAmount, today),
                paidAmount,
                bill.remainingAfter(paidAmount));
    }
}
