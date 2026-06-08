package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.MatchingInput;
import com.duing.domain.interview.service.dto.MatchingInput.ApplicantSelection;
import com.duing.domain.interview.service.dto.MatchingInput.SlotState;
import com.duing.domain.interview.service.dto.MatchingResult;
import com.duing.domain.interview.service.dto.MatchingResult.Assignment;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.function.Function;

import static java.util.stream.Collectors.toMap;

@Component
public class InterviewMatchingService {

    public MatchingResult match(MatchingInput input) {
        Map<Long, Integer> assignedCount = new HashMap<>();
        Map<Long, SlotState> slotById = input.slots().stream()
                .collect(toMap(SlotState::slotId, Function.identity()));

        List<Assignment> assigned = new ArrayList<>();
        List<Long> unassigned = new ArrayList<>();

        List<ApplicantSelection> ordered = input.applicants().stream()
                .sorted(Comparator
                        .comparingInt((ApplicantSelection a) -> a.selectedSlotIds().size())
                        .thenComparing(ApplicantSelection::applicationId))
                .toList();

        for (ApplicantSelection applicant : ordered) {
            Optional<Long> chosen = applicant.selectedSlotIds().stream()
                    .map(slotById::get)
                    .filter(Objects::nonNull)
                    .filter(slot -> assignedCount.getOrDefault(slot.slotId(), 0) < slot.capacity())
                    .min(Comparator
                            .comparingInt((SlotState s) -> assignedCount.getOrDefault(s.slotId(), 0))
                            .thenComparing(SlotState::startTime)
                            .thenComparing(SlotState::slotId))
                    .map(SlotState::slotId);

            if (chosen.isPresent()) {
                assigned.add(new Assignment(applicant.applicationId(), chosen.get()));
                assignedCount.merge(chosen.get(), 1, Integer::sum);
            } else {
                unassigned.add(applicant.applicationId());
            }
        }
        return new MatchingResult(assigned, unassigned);
    }
}
