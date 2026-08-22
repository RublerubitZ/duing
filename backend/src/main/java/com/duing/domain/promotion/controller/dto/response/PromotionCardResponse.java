package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.query.PromotionCardQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record PromotionCardResponse(
        Long id,
        ClubRef club,
        String title,
        String bannerImageUrl,
        String linkUrl,
        int displayOrder,
        Instant createdAt,
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

    public static PromotionCardResponse from(PromotionCardQuery query) {
        ClubRef clubRef = query.club() == null
                ? null
                : new ClubRef(query.club().id(), query.club().name());
        NoticeRef noticeRef = query.notice() == null
                ? null
                : new NoticeRef(query.notice().id(), query.notice().title(), query.notice().accessible());
        return new PromotionCardResponse(
                query.id(), clubRef, query.title(), query.bannerImageUrl(),
                query.linkUrl(), query.displayOrder(),
                TimeMapper.systemWallClockToInstant(query.createdAt()),
                query.tag(), query.subtitle(), query.ctaLabel(),
                query.emoji(), query.palette(),
                query.renderMode(), query.imageAltText(),
                noticeRef);
    }
}
