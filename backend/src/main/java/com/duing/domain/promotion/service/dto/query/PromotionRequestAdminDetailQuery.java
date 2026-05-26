package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import java.time.LocalDateTime;

public record PromotionRequestAdminDetailQuery(
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

    public static PromotionRequestAdminDetailQuery of(
            PromotionRequest request, ClubRef club, UserRef requester, UserRef handledBy
    ) {
        return new PromotionRequestAdminDetailQuery(
                request.getId(), club, requester,
                request.getTitle(), request.getDescription(),
                request.getSuggestedBannerImageUrl(), request.getSuggestedLinkUrl(),
                request.getStatus(), request.getActionNote(),
                handledBy, request.getHandledAt(), request.getCreatedAt());
    }
}
