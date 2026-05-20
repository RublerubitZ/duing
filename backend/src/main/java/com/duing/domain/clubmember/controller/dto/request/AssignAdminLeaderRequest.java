package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record AssignAdminLeaderRequest(
        @NotNull(message = "새 LEADER ID는 필수입니다.") @Positive Long newLeaderUserId,
        @NotBlank(message = "사유는 필수 입력값입니다.")
        @Size(max = 1000, message = "사유는 1000자 이하여야 합니다.") String reason
) {
    public AssignLeaderByAdminCommand toCommand(Long clubId, Long actorAdminId) {
        return new AssignLeaderByAdminCommand(clubId, newLeaderUserId, actorAdminId, reason);
    }
}
