package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.Promotion;
import java.time.LocalDateTime;

public record PromotionCardResponse(
        Long id,
        ClubRef club,
        String title,
        String bannerImageUrl,
        String linkUrl,
        int displayOrder,
        LocalDateTime createdAt
) {
    public record ClubRef(Long id, String name) {}

    public static PromotionCardResponse of(Promotion promotion, ClubRef club) {
        return new PromotionCardResponse(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.getDisplayOrder(), promotion.getCreatedAt());
    }
}
