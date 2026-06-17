package com.duing.domain.fee.service.dto.command;

import com.duing.domain.fee.entity.PaymentMethod;
import java.time.LocalDate;

public record RecordPaymentCommand(
        Long clubId,
        Long actorId,
        Long billId,
        Long amount,
        PaymentMethod method,
        LocalDate paidAt,
        String memo
) {}
