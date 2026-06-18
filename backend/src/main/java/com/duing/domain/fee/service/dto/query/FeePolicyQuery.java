package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeTargetType;

public record FeePolicyQuery(Long id, String name, Long amount, BillingType billingType, FeeTargetType targetType,
                             boolean active, boolean autoIssue, Integer issueDay, Integer dueDay) {

    public static FeePolicyQuery from(FeePolicy policy) {
        return new FeePolicyQuery(policy.getId(), policy.getName(), policy.getAmount(),
                policy.getBillingType(), policy.getTargetType(), policy.isActive(),
                policy.isAutoIssue(), policy.getIssueDay(), policy.getDueDay());
    }
}
