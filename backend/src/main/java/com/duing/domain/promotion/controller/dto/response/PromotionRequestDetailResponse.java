package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import java.time.LocalDateTime;

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
        LocalDateTime handledAt,
        LocalDateTime createdAt
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
                handler, request.getHandledAt(), request.getCreatedAt());
    }
}
