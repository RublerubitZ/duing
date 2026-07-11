package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.ResetPasswordCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CompletePasswordResetRequest(
        @NotBlank(message = "휴대폰 인증을 완료해주세요.")
        @Size(max = 36, message = "휴대폰 인증 정보가 올바르지 않습니다.")
        String verificationToken,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        @Pattern(
                regexp = "^(?=.{8,20}$)(?:(?=.*[A-Za-z])(?=.*\\d)|(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])|(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])).+$",
                message = "비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다."
        )
        String newPassword
) {
    public ResetPasswordCommand toCommand() {
        return new ResetPasswordCommand(verificationToken, newPassword);
    }
}
