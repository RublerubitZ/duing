package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.dto.query.PaymentQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record PaymentResponse(
        Long id,
        Long amount,
        PaymentMethod method,
        Instant paidAt,
        String memo,
        PaymentStatus status,
        String voidReason
) {
    public static PaymentResponse from(PaymentQuery query) {
        return new PaymentResponse(
                query.id(),
                query.amount(),
                query.method(),
                // paid_at 은 KST 벽시계 계열(수기 납부 atStartOfDay(SEOUL)·BANK 매칭 transactionAt) — seoul 변환.
                TimeMapper.seoulWallClockToInstant(query.paidAt()),
                query.memo(),
                query.status(),
                query.voidReason());
    }
}
