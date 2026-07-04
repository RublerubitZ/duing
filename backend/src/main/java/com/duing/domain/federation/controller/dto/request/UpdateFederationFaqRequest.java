package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateFederationFaqRequest(
        @NotNull Long categoryId,
        @NotBlank @Size(max = 300) String question,
        @NotBlank @Size(max = 4000) String answer,
        boolean pinned,
        boolean published
) {
    public UpdateFederationFaqCommand toCommand(Long faqId) {
        return new UpdateFederationFaqCommand(faqId, categoryId, question, answer, pinned, published);
    }
}
