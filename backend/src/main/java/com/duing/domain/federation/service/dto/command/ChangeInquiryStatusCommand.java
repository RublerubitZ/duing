package com.duing.domain.federation.service.dto.command;

import com.duing.domain.federation.entity.FederationInquiryStatus;

public record ChangeInquiryStatusCommand(
        Long inquiryId, FederationInquiryStatus status, Long version, String closedReason
) {
}
