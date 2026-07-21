package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.Map;

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
        long helpfulCount,
        long notHelpfulCount,
        Instant updatedAt
) {
    // feedbackCounts: helpful(true)/notHelpful(false) → 건수. 해당 FAQ에 피드백이 없으면 빈 Map(0/0).
    public static AdminFederationFaqResponse from(
            FederationFaq faq, String categoryName, Map<Boolean, Long> feedbackCounts) {
        return new AdminFederationFaqResponse(
                faq.getId(), faq.getCategoryId(), categoryName,
                faq.getQuestion(), faq.getAnswer(), faq.isPinned(), faq.isPublished(),
                faq.getSortOrder(), faq.getViewCount(),
                feedbackCounts.getOrDefault(true, 0L), feedbackCounts.getOrDefault(false, 0L),
                TimeMapper.systemWallClockToInstant(faq.getUpdatedAt()));
    }
}
