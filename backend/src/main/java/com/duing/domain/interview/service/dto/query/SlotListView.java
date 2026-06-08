package com.duing.domain.interview.service.dto.query;

import java.time.LocalDateTime;

public record SlotListView(
        Long slotId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        int capacity,
        long availabilityCount,
        long assignedCount
) {}
