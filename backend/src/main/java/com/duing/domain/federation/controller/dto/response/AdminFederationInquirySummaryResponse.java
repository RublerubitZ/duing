package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryQuery;
import java.time.LocalDateTime;

// 목록 전용 경량 응답 — content·answer 는 상세(AdminFederationInquiryDetailResponse)에서만 내려간다.
public record AdminFederationInquirySummaryResponse(
        Long id, String title, FederationInquiryStatus status,
        String authorName, String authorStudentId,
        LocalDateTime createdAt, LocalDateTime answeredAt
) {
    public static AdminFederationInquirySummaryResponse from(AdminFederationInquiryQuery query) {
        return new AdminFederationInquirySummaryResponse(
                query.inquiry().getId(), query.inquiry().getTitle(), query.inquiry().getStatus(),
                query.authorName(), query.authorStudentId(),
                query.inquiry().getCreatedAt(), query.inquiry().getAnsweredAt());
    }
}
