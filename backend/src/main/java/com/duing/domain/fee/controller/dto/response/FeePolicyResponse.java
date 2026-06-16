package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.service.dto.query.FeePolicyQuery;

public record FeePolicyResponse(Long id, String name, Long amount, BillingType billingType, boolean active) {

    public static FeePolicyResponse from(FeePolicyQuery query) {
        return new FeePolicyResponse(query.id(), query.name(), query.amount(), query.billingType(), query.active());
    }
}
