package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.UpdateClubFacilitySecuredTimeTargetCommand;
import jakarta.validation.constraints.NotNull;

public record UpdateClubFacilitySecuredTimeTargetRequest(
        @NotNull(message = "기본 확보 시간 대상 여부는 필수 입력값입니다.")
        Boolean facilitySecuredTimeTarget
) {
    public UpdateClubFacilitySecuredTimeTargetCommand toCommand(Long clubId, Long actorUserId) {
        return new UpdateClubFacilitySecuredTimeTargetCommand(clubId, facilitySecuredTimeTarget, actorUserId);
    }
}
