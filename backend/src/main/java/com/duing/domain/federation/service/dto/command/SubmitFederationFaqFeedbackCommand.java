package com.duing.domain.federation.service.dto.command;

public record SubmitFederationFaqFeedbackCommand(Long faqId, boolean helpful, String sessionKey, Long userId) {
}
