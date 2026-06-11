package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;

public record UpdateInterviewRoundCommand(
        Long roundId,
        Long currentUserId,
        String title,
        String location,
        LocalDateTime availabilityDeadline
) {}
