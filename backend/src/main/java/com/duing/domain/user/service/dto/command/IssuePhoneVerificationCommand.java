package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.VerificationPurpose;

/**
 * MO 인증 발급 커맨드. targetUserId 는 PHONE_CHANGE(요청자 본인)·PASSWORD_RESET(재설정 대상)에서
 * 세션에 귀속되고, SIGNUP 은 null 이다.
 */
public record IssuePhoneVerificationCommand(
        String phone,
        VerificationPurpose purpose,
        boolean includeQr,
        Long targetUserId
) {
}
