package com.duing.domain.notification.event;

public record FederationInquiryAnsweredEvent(Long inquiryId, Long authorId, String inquiryTitle, Long answerId) {
}
