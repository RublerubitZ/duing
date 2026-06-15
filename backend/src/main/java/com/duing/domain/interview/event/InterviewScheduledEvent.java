package com.duing.domain.interview.event;

public record InterviewScheduledEvent(Long applicationId, Long slotId, Long recruitmentId) {}
