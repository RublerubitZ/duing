package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.UpdateClubCentralClubCommand;
import jakarta.validation.constraints.NotNull;

public record UpdateClubCentralClubRequest(
        @NotNull(message = "중앙동아리 여부는 필수 입력값입니다.")
        Boolean centralClub
) {
    public UpdateClubCentralClubCommand toCommand(Long clubId) {
        return new UpdateClubCentralClubCommand(clubId, centralClub);
    }
}
