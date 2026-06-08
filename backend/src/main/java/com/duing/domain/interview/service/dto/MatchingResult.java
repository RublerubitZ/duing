package com.duing.domain.interview.service.dto;

import java.util.List;

public record MatchingResult(List<Assignment> assigned, List<Long> unassignedApplicationIds) {

    public MatchingResult {
        assigned = List.copyOf(assigned);
        unassignedApplicationIds = List.copyOf(unassignedApplicationIds);
    }

    public record Assignment(Long applicationId, Long slotId) {}
}
