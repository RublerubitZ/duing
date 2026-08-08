package com.duing.domain.joincode.controller.dto.request;

import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CreateJoinCodeRequest(
        @NotNull(message = "최대 사용 인원은 필수 입력값입니다.")
        @Min(value = 1, message = "최대 사용 인원은 1명 이상이어야 합니다.")
        @Max(value = 150, message = "최대 사용 인원은 150명 이하여야 합니다.")
        Integer maxUses,
        Integer joinWindowDays,
        @Min(value = 1, message = "기수는 1 이상이어야 합니다.")
        Integer generation
) {
    /** 가입 가능 기간을 보내지 않으면 기본 프리셋(종료 후 7일)으로 발급한다. 허용값 검증은 커맨드가 한다. */
    public CreateJoinCodeCommand toCommand(Long clubId, Long recruitmentId, Long requesterId) {
        return new CreateJoinCodeCommand(clubId, recruitmentId, requesterId, maxUses,
                joinWindowDays == null ? CreateJoinCodeCommand.DEFAULT_JOIN_WINDOW_DAYS : joinWindowDays,
                generation);
    }
}
