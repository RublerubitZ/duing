package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
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
        LocalDateTime updatedAt,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        String imageAltText,
        Long noticeId
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static PromotionAdminListQuery of(
            Promotion promotion, ClubRef club, UserRef createdBy
    ) {
        return new PromotionAdminListQuery(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy, promotion.getCreatedAt(), promotion.getUpdatedAt(),
                promotion.getTag(), promotion.getSubtitle(), promotion.getCtaLabel(),
                promotion.getEmoji(), promotion.getPalette(),
                promotion.getStartAt(), promotion.getEndAt(),
                promotion.getRenderMode(), promotion.getImageAltText(),
                promotion.getNoticeId());
    }
}
