package com.duing.domain.federation.service.dto.query;

import com.duing.domain.federation.entity.FederationInquiryStatus;

public record FederationInquiryAdminSearchCondition(
        FederationInquiryStatus status,
        String keyword
) {
}
