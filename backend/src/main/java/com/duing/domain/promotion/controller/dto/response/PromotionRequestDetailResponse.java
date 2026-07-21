package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminDetailQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record PromotionRequestDetailResponse(
        Long id,
        ClubRef club,
        UserRef requester,
        String title,
        String description,
        String suggestedBannerImageUrl,
        String suggestedLinkUrl,
        PromotionRequestStatus status,
        String actionNote,
        UserRef handledBy,
        Instant handledAt,
        Instant createdAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static PromotionRequestDetailResponse of(
            PromotionRequest request, ClubRef club, UserRef requester, UserRef handler
    ) {
        return new PromotionRequestDetailResponse(
                request.getId(), club, requester,
                request.getTitle(), request.getDescription(),
                request.getSuggestedBannerImageUrl(), request.getSuggestedLinkUrl(),
                request.getStatus(), request.getActionNote(),
                handler,
                TimeMapper.systemWallClockToInstant(request.getHandledAt()),
                TimeMapper.systemWallClockToInstant(request.getCreatedAt()));
    }

    public static PromotionRequestDetailResponse from(PromotionRequestAdminDetailQuery query) {
        ClubRef clubRef = new ClubRef(query.club().id(), query.club().name());
        UserRef requesterRef = new UserRef(query.requester().id(), query.requester().name());
        UserRef handlerRef = query.handledBy() == null
                ? null
                : new UserRef(query.handledBy().id(), query.handledBy().name());
        return new PromotionRequestDetailResponse(
                query.id(), clubRef, requesterRef,
                query.title(), query.description(),
                query.suggestedBannerImageUrl(), query.suggestedLinkUrl(),
                query.status(), query.actionNote(),
                handlerRef,
                TimeMapper.systemWallClockToInstant(query.handledAt()),
                TimeMapper.systemWallClockToInstant(query.createdAt()));
    }
}
