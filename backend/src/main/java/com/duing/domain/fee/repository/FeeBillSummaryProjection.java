package com.duing.domain.fee.repository;

/**
 * 청구(fee_bill) 단위 집계 결과. 납부 합계(payment)는 1:N fan-out 으로 totalBilled 를 중복 합산하지 않도록
 * 별도 쿼리(sumActivePaid)에서 산출하고, 본 프로젝션은 청구 그레인 값만 담는다.
 */
public record FeeBillSummaryProjection(
        long totalBilled,
        long billCount,
        long pendingCount,
        long partialPaidCount,
        long overdueCount,
        long paidCount
) {
}
