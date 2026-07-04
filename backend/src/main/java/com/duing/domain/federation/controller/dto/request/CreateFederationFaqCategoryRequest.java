package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.CreateFederationFaqCategoryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFederationFaqCategoryRequest(
        @NotBlank @Size(max = 50) String name
) {
    public CreateFederationFaqCategoryCommand toCommand() {
        return new CreateFederationFaqCategoryCommand(name);
    }
}
