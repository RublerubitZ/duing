package com.duing.domain.joincode.controller.dto.request;

import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CreateJoinCodeRequest(
        @NotNull(message = "최대 사용 인원은 필수 입력값입니다.")
        @Min(value = 1, message = "최대 사용 인원은 1명 이상이어야 합니다.")
        @Max(value = 500, message = "최대 사용 인원은 500명 이하여야 합니다.")
        Integer maxUses,
        @NotNull(message = "만료 기간은 필수 입력값입니다.")
        Integer expiresInDays,
        @Min(value = 1, message = "기수는 1 이상이어야 합니다.")
        Integer generation
) {
    public CreateJoinCodeCommand toCommand(Long clubId, Long recruitmentId, Long requesterId) {
        return new CreateJoinCodeCommand(clubId, recruitmentId, requesterId, maxUses, expiresInDays, generation);
    }
}
