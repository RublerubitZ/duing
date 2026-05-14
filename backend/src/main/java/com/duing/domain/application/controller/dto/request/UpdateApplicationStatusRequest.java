package com.duing.domain.application.controller.dto.request;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import jakarta.validation.constraints.NotNull;

public record UpdateApplicationStatusRequest(
        @NotNull(message = "변경할 상태는 필수 입력값입니다.")
        ApplicationStatus status
) {
    public UpdateApplicationStatusCommand toCommand(Long applicationId, Long currentUserId) {
        return new UpdateApplicationStatusCommand(applicationId, currentUserId, status);
    }
}
