package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCategoryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateFederationFaqCategoryRequest(
        @NotBlank @Size(max = 50) String name,
        int sortOrder
) {
    public UpdateFederationFaqCategoryCommand toCommand(Long categoryId) {
        return new UpdateFederationFaqCategoryCommand(categoryId, name, sortOrder);
    }
}
