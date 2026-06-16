package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;

public record FeePolicyQuery(Long id, String name, Long amount, BillingType billingType, boolean active) {

    public static FeePolicyQuery from(FeePolicy policy) {
        return new FeePolicyQuery(policy.getId(), policy.getName(), policy.getAmount(),
                policy.getBillingType(), policy.isActive());
    }
}
