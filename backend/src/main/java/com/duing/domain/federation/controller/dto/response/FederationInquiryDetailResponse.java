package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.List;

public record FederationInquiryDetailResponse(
        Long id, String title, String content, FederationInquiryStatus status,
        Instant createdAt, String closedReason, FederationInquiryAnswerResponse answer,
        List<FederationInquiryAttachmentResponse> attachments
) {
    public static FederationInquiryDetailResponse from(FederationInquiryDetailQuery detail) {
        return new FederationInquiryDetailResponse(
                detail.inquiry().getId(), detail.inquiry().getTitle(), detail.inquiry().getContent(),
                detail.inquiry().getStatus(),
                TimeMapper.systemWallClockToInstant(detail.inquiry().getCreatedAt()),
                detail.inquiry().getClosedReason(),
                FederationInquiryAnswerResponse.from(detail.answer()),
                detail.attachments().stream().map(FederationInquiryAttachmentResponse::from).toList());
    }
}
