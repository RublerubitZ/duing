package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import java.time.LocalDateTime;

public record FederationInquirySummaryResponse(
        Long id, String title, FederationInquiryStatus status,
        LocalDateTime createdAt, LocalDateTime answeredAt
) {
    public static FederationInquirySummaryResponse from(FederationInquiry inquiry) {
        return new FederationInquirySummaryResponse(
                inquiry.getId(), inquiry.getTitle(), inquiry.getStatus(),
                inquiry.getCreatedAt(), inquiry.getAnsweredAt());
    }
}
