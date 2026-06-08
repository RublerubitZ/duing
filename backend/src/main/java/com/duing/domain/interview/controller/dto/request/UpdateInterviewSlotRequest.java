package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
import jakarta.validation.constraints.Min;
import java.time.LocalDateTime;

public record UpdateInterviewSlotRequest(
        LocalDateTime startTime,
        LocalDateTime endTime,
        @Min(value = 1, message = "정원은 1 이상이어야 합니다") Integer capacity
) {
    public UpdateInterviewSlotCommand toCommand(Long slotId, Long actorUserId) {
        return new UpdateInterviewSlotCommand(slotId, actorUserId, startTime, endTime, capacity);
    }
}
