package com.duing.domain.notification.event;

import com.duing.domain.fee.entity.FeeStatus;

public record FeePaymentConfirmedEvent(
        Long userId,
        Long billId,
        String billingPeriod,
        FeeStatus newStatus,
        long remaining,
        Long paymentId,
        boolean autoMatched
) {}
