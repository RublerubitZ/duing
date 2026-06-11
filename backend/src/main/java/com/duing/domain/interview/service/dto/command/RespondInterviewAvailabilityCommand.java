package com.duing.domain.interview.service.dto.command;

import java.util.List;

public record RespondInterviewAvailabilityCommand(
        Long applicationId,
        Long currentUserId,
        List<Long> slotIds,
        boolean noAvailableSlot,
        String alternativeText
) {}
