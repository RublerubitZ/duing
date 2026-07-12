package com.duing.domain.federation.service.dto.command;

import java.util.List;

public record CreateFederationInquiryCommand(
        Long authorId, String title, String content, List<String> attachmentUrls) {
}
