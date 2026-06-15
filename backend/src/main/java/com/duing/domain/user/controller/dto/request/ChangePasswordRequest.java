package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.ChangePasswordCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ChangePasswordRequest(
        @NotBlank(message = "현재 비밀번호는 필수 입력값입니다.")
        String currentPassword,

        @NotBlank(message = "새 비밀번호는 필수 입력값입니다.")
        @Pattern(
                regexp = "^(?=.{8,20}$)(?:(?=.*[A-Za-z])(?=.*\\d)|(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])|(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])).+$",
                message = "비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다."
        )
        String newPassword
) {
    public ChangePasswordCommand toCommand(Long userId) {
        return new ChangePasswordCommand(userId, currentPassword, newPassword);
    }
}
