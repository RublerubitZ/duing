package com.duing.domain.interview.service.dto.command;

import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewSlotsCommand(
        Long roundId,
        Long currentUserId,
        List<SlotItem> slots
) {
    public record SlotItem(LocalDateTime startTime, LocalDateTime endTime, int capacity) {}
}
