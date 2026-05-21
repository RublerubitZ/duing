package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import java.time.LocalDateTime;

public record PromotionRequestSummaryResponse(
        Long id,
        ClubRef club,
        UserRef requester,
        String title,
        PromotionRequestStatus status,
        LocalDateTime createdAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static PromotionRequestSummaryResponse of(
            PromotionRequest request, ClubRef club, UserRef requester
    ) {
        return new PromotionRequestSummaryResponse(
                request.getId(), club, requester, request.getTitle(),
                request.getStatus(), request.getCreatedAt());
    }
}
