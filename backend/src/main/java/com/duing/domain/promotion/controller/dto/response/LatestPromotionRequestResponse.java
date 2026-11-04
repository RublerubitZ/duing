package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.service.dto.query.PromotionRequestLatestQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/** 운영진용 최근 홍보 요청 — 처리자(handledBy)는 내보내지 않는다. */
public record LatestPromotionRequestResponse(
        Long requestId,
        PromotionRequestStatus status,
        String title,
        String actionNote,
        Instant createdAt,
        Instant handledAt
) {
    public static LatestPromotionRequestResponse from(PromotionRequestLatestQuery query) {
        return new LatestPromotionRequestResponse(
                query.requestId(), query.status(), query.title(), query.actionNote(),
                TimeMapper.systemWallClockToInstant(query.createdAt()),
                TimeMapper.systemWallClockToInstant(query.handledAt()));
    }
}
