package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.UpdateInterviewConfigCommand;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateInterviewConfigRequest(
        @Future(message = "마감 시각은 미래여야 합니다")
        LocalDateTime availabilityDeadline,

        @Size(max = 200, message = "면접 장소는 200자 이내여야 합니다")
        String location
) {
    public UpdateInterviewConfigCommand toCommand(Long recruitmentId, Long actorUserId) {
        return new UpdateInterviewConfigCommand(
                recruitmentId, actorUserId, availabilityDeadline, location);
    }
}
