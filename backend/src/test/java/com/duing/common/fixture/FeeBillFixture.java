package com.duing.common.fixture;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import java.time.LocalDate;

public final class FeeBillFixture {

    private static final long DEFAULT_AMOUNT = 10000L;

    private FeeBillFixture() {
    }

    /**
     * "YYYY-MM" 회차에서 billingStartDate(1일)·billingEndDate(말일)·dueDate(말일)를 파생해 PENDING 청구를 만든다.
     * billingStartDate 가 회차마다 달라져 (fee_policy_id, user_id, billing_start_date) 유니크 인덱스가 회차별로 분리된다.
     */
    private static FeeBill pending(Long clubId, Long userId, Long policyId, String period) {
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return FeeBill.issue(clubId, userId, policyId, DEFAULT_AMOUNT, period, start, end, end);
    }

    /**
     * pending(...) 과 동일하되 status 가 CANCELLED 면 발행 후 취소 상태로 전이한다.
     * (다른 상태는 issue 가 PENDING 으로 고정하므로 PENDING 으로 둔다.)
     */
    public static FeeBill withStatus(Long clubId, Long userId, Long policyId, String period, FeeStatus status) {
        FeeBill bill = pending(clubId, userId, policyId, period);
        if (status == FeeStatus.CANCELLED) {
            bill.cancel();
        }
        return bill;
    }

    /** 발행 후 곧바로 취소된 청구(발행 이력은 남아 정책 삭제·유형 변경을 차단한다). */
    public static FeeBill cancelled(Long clubId, Long userId, Long policyId, String period) {
        return withStatus(clubId, userId, policyId, period, FeeStatus.CANCELLED);
    }
}
