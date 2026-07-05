package com.duing.domain.federation.service.dto.command;

public record CreateFederationInquiryCommand(Long authorId, String title, String content) {
}
