package com.duing.domain.promotion.service.dto.query;

public record PromotionAdminSearchCondition(
        Boolean active,
        Long clubId
) {}
