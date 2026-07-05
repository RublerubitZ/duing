package com.duing.domain.federation.service.dto.command;

public record AnswerFederationInquiryCommand(Long inquiryId, Long answeredBy, String content, Long version) {
}
