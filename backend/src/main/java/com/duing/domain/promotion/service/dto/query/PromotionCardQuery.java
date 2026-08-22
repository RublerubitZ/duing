package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import java.time.LocalDateTime;

public record PromotionCardQuery(
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

    /** 공개용 — 접근 불가 공지는 서비스가 title 을 비워서 넘긴다(제목 누출 방지). */
    public record NoticeRef(Long id, String title, boolean accessible) {}

    public static PromotionCardQuery of(Promotion promotion, ClubRef club, NoticeRef notice) {
        return new PromotionCardQuery(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.getDisplayOrder(), promotion.getCreatedAt(),
                promotion.getTag(), promotion.getSubtitle(), promotion.getCtaLabel(),
                promotion.getEmoji(), promotion.getPalette(),
                promotion.getRenderMode(), promotion.getImageAltText(),
                notice);
    }
}
