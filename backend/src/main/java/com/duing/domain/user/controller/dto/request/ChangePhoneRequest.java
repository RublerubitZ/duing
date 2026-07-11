package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.ChangePhoneCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePhoneRequest(
        // 복구 수단(전화번호) 교체는 비밀번호 변경과 동급이라 현재 비밀번호로 step-up 인증한다 (ChangePasswordRequest 와 동일).
        @NotBlank(message = "현재 비밀번호는 필수 입력값입니다.")
        String currentPassword,

        // 새 번호는 요청에 없다 — 인증 세션에 귀속된 번호가 저장된다 (spec §7.5, signup 과 동일 원칙).
        @NotBlank(message = "휴대폰 인증을 완료해주세요.")
        @Size(max = 36, message = "휴대폰 인증 정보가 올바르지 않습니다.")
        String verificationToken
) {
    public ChangePhoneCommand toCommand(Long userId) {
        return new ChangePhoneCommand(userId, currentPassword, verificationToken);
    }
}
