package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.Promotion;
import java.time.LocalDateTime;

public record AdminPromotionResponse(
        Long id,
        ClubRef club,
        String title,
        String bannerImageUrl,
        String linkUrl,
        boolean active,
        int displayOrder,
        UserRef createdBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static AdminPromotionResponse of(
            Promotion promotion, ClubRef club, UserRef createdBy
    ) {
        return new AdminPromotionResponse(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy, promotion.getCreatedAt(), promotion.getUpdatedAt());
    }
}
