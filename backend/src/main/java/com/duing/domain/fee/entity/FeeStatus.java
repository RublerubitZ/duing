package com.duing.domain.fee.entity;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

public enum FeeStatus {
    PENDING, PAID, PARTIAL_PAID, OVERDUE, CANCELLED;

    /** 미납 잔여(납부가 남아 있어 입금 매칭 후보가 되는 상태) — 완납(PAID)·취소(CANCELLED)만 아니다. */
    public boolean isUnpaidRemainder() {
        return this != PAID && this != CANCELLED;
    }

    private static final Set<FeeStatus> UNPAID_REMAINDER_SET = Arrays.stream(values())
            .filter(FeeStatus::isUnpaidRemainder)
            .collect(Collectors.toUnmodifiableSet());

    /**
     * isUnpaidRemainder() 의 컬렉션 파생 — 매칭 후보 쿼리 IN 절용. 리터럴 재열거 금지 —
     * 후보 쿼리와 승인 가드가 어긋나면 "후보로 떴는데 승인에서 거부"가 된다.
     */
    public static Set<FeeStatus> unpaidRemainderSet() {
        return UNPAID_REMAINDER_SET;
    }
}
