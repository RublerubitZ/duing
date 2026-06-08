package com.duing.domain.interview.controller.dto.response;

import java.time.LocalDateTime;

public record AutoAssignResultResponse(
        int totalCandidates,
        int assignedCount,
        int unassignedCount,
        int noAvailabilityCount,
        LocalDateTime assignmentCompletedAt
) {}
