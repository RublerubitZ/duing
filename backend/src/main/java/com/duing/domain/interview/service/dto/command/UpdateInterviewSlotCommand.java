package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;

public record UpdateInterviewSlotCommand(
        Long slotId,
        Long currentUserId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        Integer capacity
) {}
