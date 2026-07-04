package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.CreateFederationFaqCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateFederationFaqRequest(
        @NotNull Long categoryId,
        @NotBlank @Size(max = 300) String question,
        @NotBlank @Size(max = 4000) String answer,
        boolean pinned,
        boolean published
) {
    public CreateFederationFaqCommand toCommand(Long authorId) {
        return new CreateFederationFaqCommand(categoryId, question, answer, pinned, published, authorId);
    }
}
