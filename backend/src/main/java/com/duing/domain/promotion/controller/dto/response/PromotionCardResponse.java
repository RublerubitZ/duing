package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import java.time.LocalDateTime;

public record PromotionCardResponse(
        Long id,
        ClubRef club,
        String title,
        String bannerImageUrl,
        String linkUrl,
        int displayOrder,
        LocalDateTime createdAt,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette,
        PromotionRenderMode renderMode,
        String imageAltText,
        NoticeRef notice
) {
    public record ClubRef(Long id, String name) {}

    /** 공개 응답 전용 — isAccessible=false 면 title 을 빈 문자열로 채워 누출 방지. */
    public record NoticeRef(Long id, String title, boolean isAccessible) {}

    public static PromotionCardResponse of(Promotion promotion, ClubRef club, NoticeRef notice) {
        return new PromotionCardResponse(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.getDisplayOrder(), promotion.getCreatedAt(),
                promotion.getTag(), promotion.getSubtitle(), promotion.getCtaLabel(),
                promotion.getEmoji(), promotion.getPalette(),
                promotion.getRenderMode(), promotion.getImageAltText(),
                notice);
    }
}
