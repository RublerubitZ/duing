package com.duing.domain.federation.service.dto.query;

public record FederationFaqAdminSearchCondition(
        Boolean published,
        Long categoryId,
        String keyword
) {
}
