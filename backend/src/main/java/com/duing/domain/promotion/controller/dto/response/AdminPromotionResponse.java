package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
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

    public static AdminPromotionResponse from(PromotionAdminListQuery query) {
        ClubRef clubRef = query.club() == null
                ? null
                : new ClubRef(query.club().id(), query.club().name());
        UserRef userRef = new UserRef(query.createdBy().id(), query.createdBy().name());
        return new AdminPromotionResponse(
                query.id(), clubRef, query.title(), query.bannerImageUrl(),
                query.linkUrl(), query.active(), query.displayOrder(),
                userRef, query.createdAt(), query.updatedAt());
    }
}
