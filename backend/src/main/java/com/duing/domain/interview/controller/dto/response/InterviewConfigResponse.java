package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.SlotLifecyclePhase;
import java.time.LocalDateTime;

public record InterviewConfigResponse(
        Long configId,
        LocalDateTime availabilityDeadline,
        LocalDateTime assignmentCompletedAt,
        String location,
        SlotLifecyclePhase slotLifecyclePhase
) {
    public static InterviewConfigResponse from(InterviewConfig config, LocalDateTime now) {
        return new InterviewConfigResponse(
                config.getId(),
                config.getAvailabilityDeadline(),
                config.getAssignmentCompletedAt(),
                config.getLocation(),
                config.phase(now));
    }
}
