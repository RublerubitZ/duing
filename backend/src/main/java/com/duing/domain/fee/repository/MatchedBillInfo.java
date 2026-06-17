package com.duing.domain.fee.repository;

/**
 * 이미 매칭된(PAID) 청구의 표시용 정보 1건. 검토 큐의 매칭 내역에서 입금자명과 대조할
 * 매칭 회원 이름·회차를 담는다. memberName 은 탈퇴(soft-delete) 회원이면 null 일 수 있다.
 */
public record MatchedBillInfo(
        Long feeBillId,
        String memberName,
        String billingPeriod
) {}
