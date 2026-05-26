package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateLeaderSuccessionRequestRequest(
        @NotBlank(message = "사유는 필수 입력값입니다.")
        @Size(max = 1000, message = "사유는 1000자 이하여야 합니다.") String reason
) {
    public CreateSuccessionCommand toCommand(Long clubId, Long requesterUserId) {
        return new CreateSuccessionCommand(clubId, requesterUserId, reason);
    }
}
