package com.duing.domain.notification.event;

public record ApplicationSubmittedEvent(
        Long applicationId, Long recruitmentId, Long clubId, Long applicantUserId, String recruitmentTitle) {
}
