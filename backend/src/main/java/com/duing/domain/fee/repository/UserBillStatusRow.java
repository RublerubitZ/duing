package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeStatus;

/**
 * 동아리 회원별 비-CANCELLED 청구의 상태 한 종류(회원 1명에 상태별로 여러 행).
 * {@link FeeBillRepository#findNonCancelledBillStatusesByClubId(Long)} 의 JPQL 생성자 프로젝션 결과로,
 * 멤버 목록·EXPORT 의 회비 상태(PAID/UNPAID/NONE) 판정에 쓰인다.
 */
public record UserBillStatusRow(Long userId, FeeStatus status) {}
