package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record IssuePhoneVerificationRequest(
        @NotBlank(message = "전화번호는 필수 입력값입니다.")
        @Pattern(regexp = "^010-\\d{4}-\\d{4}$", message = "전화번호는 010-XXXX-XXXX 형식이어야 합니다.")
        String phone
) {
    /** 공개 발급은 회원가입 전용 — 번호 변경 발급은 인증 전용 {@code /users/me/phone-verifications}, 재설정 발급은 시작 API 내부 전용. */
    public IssuePhoneVerificationCommand toCommand(boolean includeQr) {
        return new IssuePhoneVerificationCommand(phone, VerificationPurpose.SIGNUP, includeQr, null);
    }
}
