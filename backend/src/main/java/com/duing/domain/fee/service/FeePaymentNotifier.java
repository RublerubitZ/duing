package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;

/** 납부 기록 결과를 청구 대상 회원에게 알린다. BE-3 에서 발행·연체 알림으로 확장된다. */
public interface FeePaymentNotifier {

    void notifyPaymentConfirmed(FeeBill bill, FeeStatus newStatus, long remaining, Long paymentId);
}
