package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.promotion.entity.PromotionRequestStatus;

public record PromotionRequestAdminSearchCondition(
        PromotionRequestStatus status,
        Long clubId
) {}
