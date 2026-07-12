package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank(message = "이름은 필수 입력값입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name,

        // 학년 — 생략 시 기존 값 유지(선택). 전화번호는 이 API로 변경할 수 없다(번호 변경은 MO 재인증 필요).
        Grade grade
) {
    public UpdateProfileCommand toCommand(Long userId) {
        return new UpdateProfileCommand(userId, name, grade);
    }
}
