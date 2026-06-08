package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.AssignInterviewScheduleCommand;
import jakarta.validation.constraints.NotNull;

public record AssignInterviewScheduleRequest(
        @NotNull(message = "슬롯 ID 는 필수입니다") Long slotId
) {
    public AssignInterviewScheduleCommand toCommand(Long applicationId, Long actorUserId) {
        return new AssignInterviewScheduleCommand(applicationId, slotId, actorUserId);
    }
}
