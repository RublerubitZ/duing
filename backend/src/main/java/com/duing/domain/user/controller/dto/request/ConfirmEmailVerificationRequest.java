package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.ConfirmEmailVerificationCommand;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ConfirmEmailVerificationRequest(
        @NotBlank(message = "이메일은 필수 입력값입니다.")
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Size(max = 100, message = "이메일은 100자 이하여야 합니다.")
        String email,

        @NotBlank(message = "인증코드는 필수 입력값입니다.")
        @Pattern(regexp = "\\d{6}", message = "인증코드는 6자리 숫자여야 합니다.")
        String code
) {
    public ConfirmEmailVerificationCommand toCommand() {
        return new ConfirmEmailVerificationCommand(email, code);
    }
}
