package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.LoginCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record LoginRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{8}", message = "학번은 8자리 숫자여야 합니다.")
        String studentId,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        String password
) {
    public LoginCommand toCommand() {
        return new LoginCommand(studentId, password);
    }
}
