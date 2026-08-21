package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.PaymentMethod;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record ReceiptResponse(
        String receiptNumber,
        String clubName,
        String memberName,
        String policyName,
        String billingPeriod,
        LocalDate billingStartDate,
        LocalDate billingEndDate,
        LocalDate dueDate,
        Long amount,
        Long paidTotal,
        Long remaining,
        int paymentCount,
        FeeStatus status,
        // 표기 축 — 조회 시점 기준 파생. status 는 저장 원본(레코드 보존용).
        FeeStatus displayStatus,
        Instant issuedAt,
        List<PaymentLine> payments) {

    // ACTIVE 납부 1건(VOIDED 제외). id·status·voidReason 은 영수증에 불필요해 싣지 않는다.
    public record PaymentLine(Long amount, PaymentMethod method, Instant paidAt, String memo) {}
}
