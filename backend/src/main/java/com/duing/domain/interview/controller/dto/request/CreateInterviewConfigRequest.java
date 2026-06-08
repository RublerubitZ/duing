package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.CreateInterviewConfigCommand;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

public record CreateInterviewConfigRequest(
        @NotNull(message = "마감 시각은 필수입니다")
        @Future(message = "마감 시각은 미래여야 합니다")
        LocalDateTime availabilityDeadline
) {
    public CreateInterviewConfigCommand toCommand(Long recruitmentId, Long actorUserId) {
        return new CreateInterviewConfigCommand(recruitmentId, actorUserId, availabilityDeadline);
    }
}
