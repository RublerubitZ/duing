package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaq;
import java.time.LocalDateTime;

public record AdminFederationFaqResponse(
        Long id,
        Long categoryId,
        String categoryName,
        String question,
        String answer,
        boolean pinned,
        boolean published,
        int sortOrder,
        long viewCount,
        LocalDateTime updatedAt
) {
    public static AdminFederationFaqResponse from(FederationFaq faq, String categoryName) {
        return new AdminFederationFaqResponse(
                faq.getId(), faq.getCategoryId(), categoryName,
                faq.getQuestion(), faq.getAnswer(), faq.isPinned(), faq.isPublished(),
                faq.getSortOrder(), faq.getViewCount(), faq.getUpdatedAt());
    }
}
