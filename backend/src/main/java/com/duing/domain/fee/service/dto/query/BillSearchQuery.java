package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.FeeStatus;

public record BillSearchQuery(String billingPeriod, FeeStatus status, Long userId) {
}
