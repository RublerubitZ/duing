package com.duing.domain.fee.repository;

import java.time.Instant;

/**
 * 동아리별 수납 집계(ACTIVE 납부만). {@code lastPaidAt} 은 정합 절대시각이다.
 * 납부가 없는 동아리는 {@link #EMPTY} 로 채운다.
 */
public record AdminFeePaymentAggregate(long totalPaid, Instant lastPaidAt) {

    public static final AdminFeePaymentAggregate EMPTY = new AdminFeePaymentAggregate(0L, null);
}
