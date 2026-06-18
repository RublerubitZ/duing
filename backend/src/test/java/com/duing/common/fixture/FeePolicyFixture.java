package com.duing.common.fixture;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeTargetType;

public final class FeePolicyFixture {

    private FeePolicyFixture() {
    }

    public static FeePolicy monthly(Long clubId) {
        return FeePolicy.create(clubId, "월 회비", 10000L, BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS);
    }

    public static FeePolicy of(Long clubId, BillingType billingType, long amount) {
        return FeePolicy.create(clubId, "회비", amount, billingType, FeeTargetType.ALL_MEMBERS);
    }

    /** active=false 로 비활성화된 회비 정책(발행 시 409 검증용). */
    public static FeePolicy inactive(Long clubId) {
        FeePolicy policy = FeePolicy.create(clubId, "비활성 회비", 10000L, BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS);
        policy.update(null, null, null, false);
        return policy;
    }

    /** 자동 월발행이 켜진 MONTHLY 정책(issueDay/dueDay 지정). */
    public static FeePolicy autoIssue(Long clubId, int issueDay, int dueDay) {
        FeePolicy policy = FeePolicy.create(clubId, "자동 월 회비", 10000L, BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS);
        policy.applyAutoIssue(true, issueDay, dueDay);
        return policy;
    }

    /** 특정 회원 대상(SELECTED_MEMBERS) 정책 — 발행 시 memberIds 필수. */
    public static FeePolicy selected(Long clubId, BillingType billingType, long amount) {
        return FeePolicy.create(clubId, "참가비", amount, billingType, FeeTargetType.SELECTED_MEMBERS);
    }
}
