package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessLeaderSuccessionRequest(
        @NotNull(message = "처리 결과 상태는 필수입니다.") SuccessionStatus status,
        @Size(max = 1000, message = "처리 메모는 1000자 이하여야 합니다.") String actionNote
) {
    public ProcessSuccessionCommand toCommand(Long requestId, Long handlerAdminId) {
        return new ProcessSuccessionCommand(requestId, handlerAdminId, status, actionNote);
    }
}
