package com.duing.domain.application.controller.dto.request;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.command.BulkUpdateApplicationStatusCommand;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record BulkUpdateApplicationStatusRequest(
        @NotEmpty(message = "지원 ID 목록은 비어있을 수 없습니다.")
        @Size(max = 500, message = "한 번에 처리할 수 있는 지원 수는 500건 이하입니다.")
        List<@NotNull Long> applicationIds,

        @NotNull(message = "변경할 상태는 필수 입력값입니다.")
        ApplicationStatus status
) {
    public BulkUpdateApplicationStatusCommand toCommand(Long currentUserId) {
        return new BulkUpdateApplicationStatusCommand(applicationIds, currentUserId, status);
    }
}