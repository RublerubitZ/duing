package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeStatus;

/**
 * 동아리 회원별 "가장 최근 비-CANCELLED 청구"의 상태.
 * {@link FeeBillRepository#findLatestNonCancelledBillStatusByClubId(Long)} 의 JPQL 생성자 프로젝션 결과로,
 * 멤버 목록·EXPORT 의 회비 상태(PAID/UNPAID/NONE) 판정에 쓰인다.
 */
public record LatestBillStatusRow(Long userId, FeeStatus status) {}
