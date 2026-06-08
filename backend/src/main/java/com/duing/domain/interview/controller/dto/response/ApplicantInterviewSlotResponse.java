package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.InterviewSlot;
import java.time.LocalDateTime;

public record ApplicantInterviewSlotResponse(
        Long slotId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        int capacity
) {
    public static ApplicantInterviewSlotResponse from(InterviewSlot slot) {
        return new ApplicantInterviewSlotResponse(
                slot.getId(),
                slot.getStartTime(),
                slot.getEndTime(),
                slot.getCapacity());
    }
}
