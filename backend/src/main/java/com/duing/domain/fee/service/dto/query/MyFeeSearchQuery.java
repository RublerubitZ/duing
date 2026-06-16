package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.FeeStatus;

public record MyFeeSearchQuery(Long clubId, FeeStatus status) {
}
