package com.duing.domain.federation.service.dto.command;

public record UpdateFederationInquiryCommand(Long inquiryId, Long authorId, String title, String content) {
}
