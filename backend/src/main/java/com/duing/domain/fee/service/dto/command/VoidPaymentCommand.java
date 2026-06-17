package com.duing.domain.fee.service.dto.command;

public record VoidPaymentCommand(
        Long clubId,
        Long actorId,
        Long billId,
        Long paymentId,
        String reason
) {}
