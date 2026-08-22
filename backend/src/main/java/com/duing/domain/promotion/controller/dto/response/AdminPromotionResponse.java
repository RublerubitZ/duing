package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionLinkType;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
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
        Instant createdAt,
        Instant updatedAt,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        String imageAltText,
        NoticeRef notice,
        PromotionLinkType linkType
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    /** 어드민 응답 전용 — 운영자가 비공개/삭제 공지도 식별 가능해야 하므로 title 그대로 노출. */
    public record NoticeRef(Long id, String title, NoticeVisibility visibility, boolean isAccessible) {}

    public static AdminPromotionResponse of(
            Promotion promotion, ClubRef club, UserRef createdBy, NoticeRef notice
    ) {
        return new AdminPromotionResponse(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy,
                TimeMapper.systemWallClockToInstant(promotion.getCreatedAt()),
                TimeMapper.systemWallClockToInstant(promotion.getUpdatedAt()),
                promotion.getTag(), promotion.getSubtitle(), promotion.getCtaLabel(),
                promotion.getEmoji(), promotion.getPalette(),
                promotion.getStartAt(), promotion.getEndAt(),
                promotion.getRenderMode(), promotion.getImageAltText(),
                notice,
                deriveLinkType(promotion.getLinkUrl(), promotion.getNoticeId(), promotion.getClubId()));
    }

    public static AdminPromotionResponse from(PromotionAdminListQuery query) {
        ClubRef clubRef = query.club() == null
                ? null
                : new ClubRef(query.club().id(), query.club().name());
        UserRef userRef = new UserRef(query.createdBy().id(), query.createdBy().name());
        NoticeRef notice = query.notice() == null
                ? null
                : new NoticeRef(query.notice().id(), query.notice().title(),
                        query.notice().visibility(), query.notice().accessible());
        Long clubId = query.club() == null ? null : query.club().id();
        return new AdminPromotionResponse(
                query.id(), clubRef, query.title(), query.bannerImageUrl(),
                query.linkUrl(), query.active(), query.displayOrder(),
                userRef,
                TimeMapper.systemWallClockToInstant(query.createdAt()),
                TimeMapper.systemWallClockToInstant(query.updatedAt()),
                query.tag(), query.subtitle(), query.ctaLabel(), query.emoji(), query.palette(),
                query.startAt(), query.endAt(),
                query.renderMode(), query.imageAltText(),
                notice,
                deriveLinkType(query.linkUrl(), query.noticeId(), clubId));
    }

    private static PromotionLinkType deriveLinkType(String linkUrl, Long noticeId, Long clubId) {
        if (linkUrl != null && !linkUrl.isBlank()) return PromotionLinkType.URL;
        if (noticeId != null) return PromotionLinkType.NOTICE;
        if (clubId != null) return PromotionLinkType.CLUB;
        return PromotionLinkType.NONE;
    }
}
