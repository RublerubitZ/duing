package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.SendEmailVerificationCommand;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SendEmailVerificationRequest(
        @NotBlank(message = "이메일은 필수 입력값입니다.")
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Pattern(
                regexp = "^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)*daegu\\.ac\\.kr$",
                message = "대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다."
        )
        @Size(max = 100, message = "이메일은 100자 이하여야 합니다.")
        String email
) {
    public SendEmailVerificationCommand toCommand() {
        return new SendEmailVerificationCommand(email);
    }
}
