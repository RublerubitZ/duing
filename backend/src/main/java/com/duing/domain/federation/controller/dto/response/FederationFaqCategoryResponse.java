package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationFaqCategory;

public record FederationFaqCategoryResponse(
        Long id,
        String name,
        int sortOrder
) {
    public static FederationFaqCategoryResponse from(FederationFaqCategory category) {
        return new FederationFaqCategoryResponse(category.getId(), category.getName(), category.getSortOrder());
    }
}
