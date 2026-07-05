package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCategoryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record UpdateFederationFaqCategoryRequest(
        @NotBlank(message = "카테고리 이름은 필수 입력값입니다.")
        @Size(max = 50, message = "카테고리 이름은 50자 이하여야 합니다.")
        String name,

        @PositiveOrZero(message = "정렬순서는 0 이상이어야 합니다.")
        int sortOrder
) {
    public UpdateFederationFaqCategoryCommand toCommand(Long categoryId) {
        return new UpdateFederationFaqCategoryCommand(categoryId, name, sortOrder);
    }
}
