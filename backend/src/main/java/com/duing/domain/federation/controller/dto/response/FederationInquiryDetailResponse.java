package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import java.time.LocalDateTime;

public record FederationInquiryDetailResponse(
        Long id, String title, String content, FederationInquiryStatus status,
        LocalDateTime createdAt, String closedReason, FederationInquiryAnswerResponse answer
) {
    public static FederationInquiryDetailResponse from(FederationInquiryDetailQuery detail) {
        return new FederationInquiryDetailResponse(
                detail.inquiry().getId(), detail.inquiry().getTitle(), detail.inquiry().getContent(),
                detail.inquiry().getStatus(), detail.inquiry().getCreatedAt(),
                detail.inquiry().getClosedReason(),
                FederationInquiryAnswerResponse.from(detail.answer()));
    }
}
