package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.LoginCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{8}", message = "학번은 8자리 숫자여야 합니다.")
        String studentId,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        String password,

        @Size(max = 100, message = "기기 이름은 100자 이하여야 합니다.")
        String deviceLabel,

        String platform,

        Boolean rememberMe
) {
    public LoginCommand toCommand() {
        return new LoginCommand(studentId, password);
    }

    /** 웹 전용 의미 — 미지정(null)은 false(세션 쿠키). 모바일 로그인은 이 값을 무시한다 (spec §8). */
    public boolean rememberMeOrDefault() {
        return Boolean.TRUE.equals(rememberMe);
    }
}
