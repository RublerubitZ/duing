package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
import jakarta.validation.constraints.Min;
import java.time.LocalDateTime;

public record UpdateInterviewSlotRequest(
        // startTime/endTime 은 쌍으로만 변경할 수 있다 — 한쪽만 오면 400 (서비스 검증).
        LocalDateTime startTime,
        LocalDateTime endTime,
        @Min(value = 1, message = "동시 면접 인원은 1 이상이어야 합니다.")
        Integer capacity
) {
    public UpdateInterviewSlotCommand toCommand(Long slotId, Long currentUserId) {
        return new UpdateInterviewSlotCommand(slotId, currentUserId, startTime, endTime, capacity);
    }
}
