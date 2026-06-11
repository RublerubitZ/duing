package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewRoundCommand(
        Long recruitmentId,
        Long currentUserId,
        String title,
        LocalDateTime availabilityDeadline,
        String location,
        List<Long> applicationIds
) {}
