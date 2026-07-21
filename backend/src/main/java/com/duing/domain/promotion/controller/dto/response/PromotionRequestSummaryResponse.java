package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSummaryQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record PromotionRequestSummaryResponse(
        Long id,
        ClubRef club,
        UserRef requester,
        String title,
        PromotionRequestStatus status,
        Instant createdAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static PromotionRequestSummaryResponse of(
            PromotionRequest request, ClubRef club, UserRef requester
    ) {
        return new PromotionRequestSummaryResponse(
                request.getId(), club, requester, request.getTitle(),
                request.getStatus(),
                TimeMapper.systemWallClockToInstant(request.getCreatedAt()));
    }

    public static PromotionRequestSummaryResponse from(PromotionRequestAdminSummaryQuery query) {
        ClubRef clubRef = new ClubRef(query.club().id(), query.club().name());
        UserRef requesterRef = new UserRef(query.requester().id(), query.requester().name());
        return new PromotionRequestSummaryResponse(
                query.id(), clubRef, requesterRef, query.title(),
                query.status(),
                TimeMapper.systemWallClockToInstant(query.createdAt()));
    }
}
