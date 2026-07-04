package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaq;

public record FederationFaqResponse(
        Long id,
        Long categoryId,
        String categoryName,
        String question,
        String answer,
        boolean pinned
) {
    public static FederationFaqResponse from(FederationFaq faq, String categoryName) {
        return new FederationFaqResponse(
                faq.getId(), faq.getCategoryId(), categoryName,
                faq.getQuestion(), faq.getAnswer(), faq.isPinned());
    }
}
