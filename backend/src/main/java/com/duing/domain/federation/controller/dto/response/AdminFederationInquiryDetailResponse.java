package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryDetailQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.List;

public record AdminFederationInquiryDetailResponse(
        Long id, String title, String content, FederationInquiryStatus status,
        Long version,   // FE 가 status PATCH·직행 답변에 echo — admin 응답에만 노출
        String authorName, String authorStudentId,
        Instant createdAt, Instant answeredAt, String closedReason,
        FederationInquiryAnswerResponse answer,
        List<FederationInquiryAttachmentResponse> attachments
) {
    public static AdminFederationInquiryDetailResponse from(AdminFederationInquiryDetailQuery detail) {
        return new AdminFederationInquiryDetailResponse(
                detail.inquiry().getId(), detail.inquiry().getTitle(), detail.inquiry().getContent(),
                detail.inquiry().getStatus(), detail.inquiry().getVersion(),
                detail.authorName(), detail.authorStudentId(),
                TimeMapper.systemWallClockToInstant(detail.inquiry().getCreatedAt()),
                TimeMapper.systemWallClockToInstant(detail.inquiry().getAnsweredAt()),
                detail.inquiry().getClosedReason(),
                FederationInquiryAnswerResponse.from(detail.answer()),
                detail.attachments().stream().map(FederationInquiryAttachmentResponse::from).toList());
    }
}
