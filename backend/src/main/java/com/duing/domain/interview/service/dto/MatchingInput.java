package com.duing.domain.interview.service.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

public record MatchingInput(List<ApplicantSelection> applicants, List<SlotState> slots) {

    public MatchingInput {
        applicants = List.copyOf(applicants);
        slots = List.copyOf(slots);
    }

    public record ApplicantSelection(Long applicationId, Set<Long> selectedSlotIds) {
        public ApplicantSelection {
            selectedSlotIds = Set.copyOf(selectedSlotIds);
        }
    }

    public record SlotState(Long slotId, LocalDateTime startTime, int capacity) {}
}
