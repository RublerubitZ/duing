package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.CloseClubCommand;
import jakarta.validation.constraints.Size;

public record CloseClubRequest(
        @Size(max = 500, message = "폐쇄 사유는 500자 이하여야 합니다.")
        String closureReason
) {
    private static final String DEFAULT_REASON = "동아리 폐쇄";

    public CloseClubCommand toCommand(Long clubId, Long actorUserId) {
        String normalized = (closureReason == null || closureReason.isBlank())
                ? DEFAULT_REASON
                : closureReason.strip();
        return new CloseClubCommand(clubId, actorUserId, normalized);
    }
}
