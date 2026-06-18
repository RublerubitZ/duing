package com.duing.domain.fee.repository;

import java.time.LocalDate;

/**
 * 마감 임박(D-3/D-1/D-0) 미납 청구의 리마인더 발송 대상.
 * {@link FeeBillRepository#findDueSoonUnpaidBills(java.util.Collection)} 의 JPQL 생성자 프로젝션 결과.
 */
public record FeeBillDueSoonRow(Long billId, Long userId, Long clubId, String clubName,
                                String billingPeriod, LocalDate dueDate) {}
