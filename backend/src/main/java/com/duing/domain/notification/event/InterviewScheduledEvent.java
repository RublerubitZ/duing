package com.duing.domain.notification.event;

import java.time.LocalDateTime;

public record InterviewScheduledEvent(
        Long applicationId,
        Long userId,
        String clubName,
        LocalDateTime interviewAt,
        String interviewLocation
) {}
