package com.duing.domain.user.profilecheck.controller.dto.request;

import com.duing.domain.user.profilecheck.service.dto.command.UpdateProfileCheckSettingCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateProfileCheckSettingRequest(
        @NotBlank(message = "팝업 제목은 필수 입력값입니다.")
        @Size(max = 50, message = "팝업 제목은 50자 이하여야 합니다.")
        String title,

        @NotBlank(message = "안내 문구는 필수 입력값입니다.")
        @Size(max = 300, message = "안내 문구는 300자 이하여야 합니다.")
        String message,

        // 누락을 false 로 채우면 문구만 고치려던 저장이 팝업을 끈다 — 박스 타입 + @NotNull 로 400.
        @NotNull(message = "노출 여부는 필수 입력값입니다.")
        Boolean enabled
) {
    // 앞뒤 공백은 저장 전에 제거한다 — 역직렬화 직후(검증 전) 실행되므로 @NotBlank·@Size 도 strip 값 기준이다.
    public UpdateProfileCheckSettingRequest {
        if (title != null) {
            title = title.strip();
        }
        if (message != null) {
            message = message.strip();
        }
    }

    public UpdateProfileCheckSettingCommand toCommand(Long actorId) {
        return new UpdateProfileCheckSettingCommand(actorId, title, message, enabled);
    }
}
