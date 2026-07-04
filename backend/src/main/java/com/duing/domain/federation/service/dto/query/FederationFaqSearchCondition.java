package com.duing.domain.federation.service.dto.query;

public record FederationFaqSearchCondition(
        Long categoryId,
        String keyword
) {
}
