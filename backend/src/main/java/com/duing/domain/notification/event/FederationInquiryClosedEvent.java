package com.duing.domain.notification.event;

public record FederationInquiryClosedEvent(Long inquiryId, Long authorId, String inquiryTitle, String closedReason) {
}
