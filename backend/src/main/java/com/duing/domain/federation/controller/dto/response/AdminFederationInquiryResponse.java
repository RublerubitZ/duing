package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryQuery;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import java.time.LocalDateTime;

public record AdminFederationInquiryResponse(
        Long id, String title, String content, FederationInquiryStatus status,
        Long version,   // FE 가 status PATCH·직행 답변에 echo — admin 응답에만 노출
        String authorName, String authorStudentId,
        LocalDateTime createdAt, LocalDateTime answeredAt, String closedReason,
        FederationInquiryAnswerResponse answer
) {
    public static AdminFederationInquiryResponse fromQuery(AdminFederationInquiryQuery query) {
        return new AdminFederationInquiryResponse(
                query.inquiry().getId(), query.inquiry().getTitle(), null, query.inquiry().getStatus(),
                query.inquiry().getVersion(), query.authorName(), query.authorStudentId(),
                query.inquiry().getCreatedAt(), query.inquiry().getAnsweredAt(),
                query.inquiry().getClosedReason(), null);  // 목록은 content·answer 미포함(경량)
    }

    public static AdminFederationInquiryResponse fromDetail(
            FederationInquiryDetailQuery detail, String authorName, String authorStudentId) {
        return new AdminFederationInquiryResponse(
                detail.inquiry().getId(), detail.inquiry().getTitle(), detail.inquiry().getContent(),
                detail.inquiry().getStatus(), detail.inquiry().getVersion(),
                authorName, authorStudentId,
                detail.inquiry().getCreatedAt(), detail.inquiry().getAnsweredAt(),
                detail.inquiry().getClosedReason(),
                FederationInquiryAnswerResponse.from(detail.answer()));
    }
}
