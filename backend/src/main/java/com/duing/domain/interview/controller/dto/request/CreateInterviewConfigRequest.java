package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.CreateInterviewConfigCommand;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreateInterviewConfigRequest(
        @NotNull(message = "마감 시각은 필수입니다")
        @Future(message = "마감 시각은 미래여야 합니다")
        LocalDateTime availabilityDeadline,

        @Size(max = 200, message = "면접 장소는 200자 이내여야 합니다")
        String location
) {
    public CreateInterviewConfigCommand toCommand(Long recruitmentId, Long actorUserId) {
        return new CreateInterviewConfigCommand(
                recruitmentId, actorUserId, availabilityDeadline, location);
    }
}
