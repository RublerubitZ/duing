package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.promotion.entity.Promotion;
import java.time.LocalDateTime;

public record PromotionAdminListQuery(
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

    public static PromotionAdminListQuery of(
            Promotion promotion, ClubRef club, UserRef createdBy
    ) {
        return new PromotionAdminListQuery(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy, promotion.getCreatedAt(), promotion.getUpdatedAt());
    }
}
