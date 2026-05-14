package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import jakarta.validation.constraints.NotNull;

public record UpdateClubStatusRequest(
        @NotNull(message = "변경할 상태는 필수 입력값입니다.")
        ClubStatus status
) {
    public UpdateClubStatusCommand toCommand(Long clubId) {
        return new UpdateClubStatusCommand(clubId, status);
    }
}
