package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewSlotsCommand(
        Long recruitmentId,
        Long actorUserId,
        List<SlotEntry> slots
) {

    public record SlotEntry(
            LocalDateTime startTime,
            LocalDateTime endTime,
            int capacity
    ) {}
}
