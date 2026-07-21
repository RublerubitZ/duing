package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

// 목록 전용 경량 응답 — content·answer 는 상세(AdminFederationInquiryDetailResponse)에서만 내려간다.
public record AdminFederationInquirySummaryResponse(
        Long id, String title, FederationInquiryStatus status,
        String authorName, String authorStudentId,
        Instant createdAt, Instant answeredAt
) {
    public static AdminFederationInquirySummaryResponse from(AdminFederationInquiryQuery query) {
        return new AdminFederationInquirySummaryResponse(
                query.inquiry().getId(), query.inquiry().getTitle(), query.inquiry().getStatus(),
                query.authorName(), query.authorStudentId(),
                TimeMapper.systemWallClockToInstant(query.inquiry().getCreatedAt()),
                TimeMapper.systemWallClockToInstant(query.inquiry().getAnsweredAt()));
    }
}
