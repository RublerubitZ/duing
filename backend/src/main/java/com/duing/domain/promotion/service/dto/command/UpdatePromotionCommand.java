package com.duing.domain.promotion.service.dto.command;

import com.duing.domain.promotion.entity.PromotionPalette;
import java.time.LocalDateTime;

public record UpdatePromotionCommand(
        Long promotionId,
        String title,
        String bannerImageUrl,
        String linkUrl,
        Long clubId,
        Boolean active,
        Integer displayOrder,
        Boolean clearClubId,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        Boolean clearBannerImageUrl,
        Boolean clearLinkUrl,
        Boolean clearTag,
        Boolean clearSubtitle,
        Boolean clearCtaLabel,
        Boolean clearEmoji,
        Boolean clearStartAt,
        Boolean clearEndAt
) {}
