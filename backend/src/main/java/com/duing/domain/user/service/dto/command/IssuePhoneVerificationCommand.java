package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.VerificationPurpose;

/** PR1 은 SIGNUP 전용 — 컨트롤러가 purpose 를 고정한다. PHONE_CHANGE/PASSWORD_RESET 발급은 PR4. */
public record IssuePhoneVerificationCommand(
        String phone,
        VerificationPurpose purpose,
        boolean includeQr
) {
}
