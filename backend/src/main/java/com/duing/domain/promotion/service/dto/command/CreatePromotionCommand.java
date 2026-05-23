package com.duing.domain.promotion.service.dto.command;

import com.duing.domain.promotion.entity.PromotionPalette;

public record CreatePromotionCommand(
        Long clubId,
        String title,
        String bannerImageUrl,
        String linkUrl,
        boolean active,
        int displayOrder,
        Long createdBy,
        String tag,
        String subtitle,
        String ctaLabel,
        String emoji,
        PromotionPalette palette
) {}
