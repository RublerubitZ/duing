package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record FederationInquirySummaryResponse(
        Long id, String title, FederationInquiryStatus status,
        Instant createdAt, Instant answeredAt
) {
    public static FederationInquirySummaryResponse from(FederationInquiry inquiry) {
        // answeredAt 은 엔티티가 무클럭 LocalDateTime.now()(JVM 기본 존)로 기록 — createdAt(감사)과 같은 system 계열.
        return new FederationInquirySummaryResponse(
                inquiry.getId(), inquiry.getTitle(), inquiry.getStatus(),
                TimeMapper.systemWallClockToInstant(inquiry.getCreatedAt()),
                TimeMapper.systemWallClockToInstant(inquiry.getAnsweredAt()));
    }
}
