package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.notice.entity.NoticeVisibility;
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
        Long noticeId,
        NoticeRef notice
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    /** 어드민용 — 비공개·삭제 공지도 운영자가 식별해야 하므로 title 원값(삭제 시 라벨)과 visibility 를 그대로 담는다. */
    public record NoticeRef(Long id, String title, NoticeVisibility visibility, boolean accessible) {}

    public static PromotionAdminListQuery of(
            Promotion promotion, ClubRef club, UserRef createdBy, NoticeRef notice
    ) {
        return new PromotionAdminListQuery(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy, promotion.getCreatedAt(), promotion.getUpdatedAt(),
                promotion.getTag(), promotion.getSubtitle(), promotion.getCtaLabel(),
                promotion.getEmoji(), promotion.getPalette(),
                promotion.getStartAt(), promotion.getEndAt(),
                promotion.getRenderMode(), promotion.getImageAltText(),
                promotion.getNoticeId(), notice);
    }
}
