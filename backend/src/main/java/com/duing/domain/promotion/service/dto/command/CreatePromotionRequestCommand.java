package com.duing.domain.promotion.service.dto.command;

public record CreatePromotionRequestCommand(
        Long clubId,
        Long requesterUserId,
        String title,
        String description,
        String suggestedBannerImageUrl,
        String suggestedLinkUrl
) {}
