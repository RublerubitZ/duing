package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.UpdateAvailabilityCommand;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record UpdateAvailabilityRequest(
        @NotNull(message = "슬롯 ID 목록은 필수입니다")
        @NotEmpty(message = "슬롯 ID 목록은 비어있을 수 없습니다")
        List<Long> slotIds
) {
    public UpdateAvailabilityCommand toCommand(Long applicationId, Long actorUserId) {
        return new UpdateAvailabilityCommand(applicationId, actorUserId, slotIds);
    }
}
