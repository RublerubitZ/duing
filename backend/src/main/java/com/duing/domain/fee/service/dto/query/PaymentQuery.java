package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.PaymentStatus;
import java.time.LocalDateTime;

public record PaymentQuery(
        Long id,
        Long amount,
        PaymentMethod method,
        LocalDateTime paidAt,
        String memo,
        PaymentStatus status,
        String voidReason
) {
    public static PaymentQuery from(Payment payment) {
        return new PaymentQuery(
                payment.getId(),
                payment.getAmount(),
                payment.getMethod(),
                payment.getPaidAt(),
                payment.getMemo(),
                payment.getStatus(),
                payment.getVoidReason());
    }
}
