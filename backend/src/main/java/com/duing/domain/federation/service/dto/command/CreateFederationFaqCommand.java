package com.duing.domain.federation.service.dto.command;

public record CreateFederationFaqCommand(
        Long categoryId, String question, String answer,
        boolean pinned, boolean published, Long authorId
) {
}
