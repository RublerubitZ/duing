package com.duing.domain.federation.service.dto.command;

public record UpdateFederationFaqCommand(
        Long faqId, Long categoryId, String question, String answer,
        boolean pinned, boolean published
) {
}
