package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.InterviewConfig;
import java.time.LocalDateTime;

public record InterviewConfigResponse(
        Long configId,
        LocalDateTime availabilityDeadline,
        LocalDateTime assignmentCompletedAt,
        String location
) {
    public static InterviewConfigResponse from(InterviewConfig config) {
        return new InterviewConfigResponse(
                config.getId(),
                config.getAvailabilityDeadline(),
                config.getAssignmentCompletedAt(),
                config.getLocation());
    }
}
