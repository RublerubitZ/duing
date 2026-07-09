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
    /** PR1 은 회원가입 용도 고정 — purpose 필드 노출은 PR4 에서 (기본값 SIGNUP 으로 비파괴 확장). */
    public IssuePhoneVerificationCommand toCommand(boolean includeQr) {
        return new IssuePhoneVerificationCommand(phone, VerificationPurpose.SIGNUP, includeQr);
    }
}
