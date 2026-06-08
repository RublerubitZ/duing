package com.duing.domain.interview.event;

public record InterviewUpdatedEvent(Long applicationId, Long slotId, Long recruitmentId) {}
