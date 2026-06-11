package com.duing.domain.interview.event;

public record InterviewAvailabilityRequestedEvent(Long roundId, Long applicationId, int requestSequence) {}
