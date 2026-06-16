package com.duing.common.fixture;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;

public final class FeePolicyFixture {

    private FeePolicyFixture() {
    }

    public static FeePolicy monthly(Long clubId) {
        return FeePolicy.create(clubId, "월 회비", 10000L, BillingType.MONTHLY);
    }
}
