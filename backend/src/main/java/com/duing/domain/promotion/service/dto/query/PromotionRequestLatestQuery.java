package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import java.time.LocalDateTime;

public record PromotionRequestLatestQuery(
        Long requestId,
        PromotionRequestStatus status,
        String title,
        String actionNote,
        LocalDateTime createdAt,
        LocalDateTime handledAt
) {
    public static PromotionRequestLatestQuery from(PromotionRequest request) {
        return new PromotionRequestLatestQuery(
                request.getId(), request.getStatus(), request.getTitle(),
                request.getActionNote(), request.getCreatedAt(), request.getHandledAt());
    }
}
