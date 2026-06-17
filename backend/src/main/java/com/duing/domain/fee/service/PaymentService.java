package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.command.RecordPaymentCommand;
import com.duing.domain.fee.service.dto.query.PaymentQuery;
import java.util.List;

public interface PaymentService {

    Long record(RecordPaymentCommand command);

    void voidPayment(Long clubId, Long actorId, Long billId, Long paymentId, String reason);

    List<PaymentQuery> getPayments(Long clubId, Long actorId, Long billId);
}
