package com.duing.domain.interview.controller.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record MatchingCandidatesResponse(
        int totalCandidates,
        int candidatesWithAvailability,
        int candidatesWithoutAvailability,
        List<SlotCandidatesView> slots
) {
    public record SlotCandidatesView(
            Long slotId,
            LocalDateTime startTime,
            int capacity,
            long availabilityCount,
            long alreadyAssignedCount
    ) {}
}
