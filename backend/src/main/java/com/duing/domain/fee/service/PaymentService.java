package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.command.RecordPaymentCommand;
import com.duing.domain.fee.service.dto.command.VoidPaymentCommand;
import com.duing.domain.fee.service.dto.query.PaymentQuery;
import java.util.List;

public interface PaymentService {

    Long record(RecordPaymentCommand command);

    void voidPayment(VoidPaymentCommand command);

    List<PaymentQuery> getPayments(Long clubId, Long actorId, Long billId);
}
