package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.ChangePhoneCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePhoneRequest(
        // 새 번호는 요청에 없다 — 인증 세션에 귀속된 번호가 저장된다 (spec §7.5, signup 과 동일 원칙).
        @NotBlank(message = "휴대폰 인증을 완료해주세요.")
        @Size(max = 36, message = "휴대폰 인증 정보가 올바르지 않습니다.")
        String verificationToken
) {
    public ChangePhoneCommand toCommand(Long userId) {
        return new ChangePhoneCommand(userId, verificationToken);
    }
}
