package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateClubStatusRequest(
        @NotNull(message = "변경할 상태는 필수 입력값입니다.")
        ClubStatus status,

        @Size(max = 500, message = "거절 사유는 500자 이하여야 합니다.")
        String rejectionReason
) {
    public UpdateClubStatusCommand toCommand(Long clubId, Long actorUserId) {
        return new UpdateClubStatusCommand(clubId, status, rejectionReason, actorUserId);
    }
}
