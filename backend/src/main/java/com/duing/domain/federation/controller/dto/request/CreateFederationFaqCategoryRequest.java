package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.CreateFederationFaqCategoryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFederationFaqCategoryRequest(
        @NotBlank(message = "카테고리 이름은 필수 입력값입니다.")
        @Size(max = 50, message = "카테고리 이름은 50자 이하여야 합니다.")
        String name
) {
    public CreateFederationFaqCategoryCommand toCommand() {
        return new CreateFederationFaqCategoryCommand(name);
    }
}
