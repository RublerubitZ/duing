package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessRecertificationRequest(
        @NotNull(message = "처리 결과 상태는 필수입니다.") RecertificationStatus status,
        @Size(max = 1000, message = "처리 메모는 1000자 이하여야 합니다.") String actionNote
) {
    public ProcessRecertificationCommand toCommand(Long requestId, Long handlerAdminId) {
        return new ProcessRecertificationCommand(requestId, handlerAdminId, status, actionNote);
    }
}
