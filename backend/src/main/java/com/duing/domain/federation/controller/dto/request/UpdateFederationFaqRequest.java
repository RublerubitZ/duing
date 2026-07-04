package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateFederationFaqRequest(
        @NotNull(message = "카테고리는 필수 입력값입니다.")
        Long categoryId,

        @NotBlank(message = "질문은 필수 입력값입니다.")
        @Size(max = 300, message = "질문은 300자 이하여야 합니다.")
        String question,

        @NotBlank(message = "답변은 필수 입력값입니다.")
        @Size(max = 4000, message = "답변은 4000자 이하여야 합니다.")
        String answer,

        boolean pinned,
        boolean published
) {
    public UpdateFederationFaqCommand toCommand(Long faqId) {
        return new UpdateFederationFaqCommand(faqId, categoryId, question, answer, pinned, published);
    }
}
