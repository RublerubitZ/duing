package com.duing.domain.fee.entity;

import java.time.LocalDate;
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

    /**
     * 청구액·마감일·활성 납부 합계로 '오늘' 기준 납부 상태를 산출한다 — 쓰기 경로(FeeBillStatusCalculator,
     * 저장 status 전이)와 표기 경로(displayStatus)가 공유하는 단일 공식. 마감 당일까지 정상, 익일부터 연체
     * (admin 감사 콘솔의 dueDate.lt(today) 파생과 동치). CANCELLED 는 운영자 전용이라 산출하지 않는다.
     */
    public static FeeStatus calculate(long billAmount, LocalDate dueDate, long activePaidSum, LocalDate today) {
        if (activePaidSum >= billAmount) {
            return PAID;
        }
        boolean pastDue = dueDate.isBefore(today);
        if (activePaidSum > 0) {
            return pastDue ? OVERDUE : PARTIAL_PAID;
        }
        return pastDue ? OVERDUE : PENDING;
    }

    /**
     * 표기 축(displayStatus) — 저장 status 를 덮지 않는 읽기 전용 파생. 연체 전이 배치의 실행 시점과
     * 무관하게 항상 현재 시점 기준으로 판정되며, 완납이 최우선이다(저장이 OVERDUE 여도 완납이면 PAID).
     * CANCELLED 만 운영자 결정이라 그대로 통과한다. 화면 표기는 이 값을, 액션 가드·배치·알림은 저장 status 를 쓴다.
     */
    public static FeeStatus resolveDisplay(FeeStatus storedStatus, long billAmount, LocalDate dueDate,
                                           long activePaidSum, LocalDate today) {
        if (storedStatus == CANCELLED) {
            return CANCELLED;
        }
        return calculate(billAmount, dueDate, activePaidSum, today);
    }
}
