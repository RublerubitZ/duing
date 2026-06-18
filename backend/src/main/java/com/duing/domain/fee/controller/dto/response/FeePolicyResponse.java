package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.service.dto.query.FeePolicyQuery;

public record FeePolicyResponse(Long id, String name, Long amount, BillingType billingType, boolean active,
                                boolean autoIssue, Integer issueDay, Integer dueDay) {

    public static FeePolicyResponse from(FeePolicyQuery query) {
        return new FeePolicyResponse(query.id(), query.name(), query.amount(), query.billingType(), query.active(),
                query.autoIssue(), query.issueDay(), query.dueDay());
    }
}
