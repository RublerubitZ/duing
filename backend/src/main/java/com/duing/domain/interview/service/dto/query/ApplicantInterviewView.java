package com.duing.domain.interview.service.dto.query;

import java.time.LocalDateTime;
import java.util.List;

public record ApplicantInterviewView(
        ApplicantInterviewPhase phase,
        LocalDateTime availabilityDeadline,
        List<SelectableSlot> slots,
        String myAlternativeText,
        ScheduledInterview scheduledInterview
) {
    public record SelectableSlot(Long slotId, LocalDateTime startTime, LocalDateTime endTime,
                                 boolean selected) {}

    public record ScheduledInterview(LocalDateTime startTime, LocalDateTime endTime, String location) {}

    public static ApplicantInterviewView phaseOnly(ApplicantInterviewPhase phase) {
        return new ApplicantInterviewView(phase, null, null, null, null);
    }
}
