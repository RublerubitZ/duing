package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.dto.query.PaymentQuery;
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
                query.paidAt(),
                query.memo(),
                query.status(),
                query.voidReason());
    }
}
