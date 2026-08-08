package com.duing.domain.joincode.controller.dto.request;

import com.duing.domain.joincode.service.dto.command.CreateClubInviteCodeCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CreateClubInviteCodeRequest(
        @NotNull(message = "최대 사용 인원은 필수 입력값입니다.")
        @Min(value = 1, message = "최대 사용 인원은 1명 이상이어야 합니다.")
        @Max(value = 150, message = "최대 사용 인원은 150명 이하여야 합니다.")
        Integer maxUses,
        Integer expiresInHours,
        Boolean autoApprove,
        @Min(value = 1, message = "기수는 1 이상이어야 합니다.")
        Integer generation
) {
    /** 유효기간을 보내지 않으면 기본 프리셋(24시간)으로 발급한다. 허용값 검증은 커맨드가 한다. */
    public CreateClubInviteCodeCommand toCommand(Long clubId, Long requesterId) {
        return new CreateClubInviteCodeCommand(clubId, requesterId, maxUses,
                expiresInHours == null
                        ? CreateClubInviteCodeCommand.DEFAULT_EXPIRES_IN_HOURS : expiresInHours,
                autoApprove, generation);
    }
}
