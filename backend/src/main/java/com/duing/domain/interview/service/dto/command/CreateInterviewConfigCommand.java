package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;

public record CreateInterviewConfigCommand(
        Long recruitmentId,
        Long actorUserId,
        LocalDateTime availabilityDeadline,
        String location
) {}
