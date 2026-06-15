package com.duing.domain.interview.event;

public record InterviewCancelledEvent(Long applicationId, Long slotId, Long recruitmentId) {}
