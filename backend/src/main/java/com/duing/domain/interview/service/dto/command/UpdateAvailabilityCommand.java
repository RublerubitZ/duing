package com.duing.domain.interview.service.dto.command;

import java.util.List;

public record UpdateAvailabilityCommand(
        Long applicationId,
        Long actorUserId,
        List<Long> slotIds
) {}
