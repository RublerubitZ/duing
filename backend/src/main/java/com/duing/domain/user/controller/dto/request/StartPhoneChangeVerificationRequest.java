package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.service.dto.command.IssuePhoneVerificationCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record StartPhoneChangeVerificationRequest(
        @NotBlank(message = "전화번호는 필수 입력값입니다.")
        @Pattern(regexp = "^010-\\d{4}-\\d{4}$", message = "전화번호는 010-XXXX-XXXX 형식이어야 합니다.")
        String phone
) {
    public IssuePhoneVerificationCommand toCommand(boolean includeQr, Long currentUserId) {
        return new IssuePhoneVerificationCommand(phone, VerificationPurpose.PHONE_CHANGE, includeQr, currentUserId);
    }
}
