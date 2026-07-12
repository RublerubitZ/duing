package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.entity.PhoneVerificationStatus;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;

public record PhoneVerificationStatusResponse(
        PhoneVerificationStatus status,
        long expiresInSeconds,
        String maskedPhone
) {
    public static PhoneVerificationStatusResponse from(PhoneVerificationStatusResult statusResult) {
        return new PhoneVerificationStatusResponse(
                statusResult.status(), statusResult.expiresInSeconds(), statusResult.maskedPhone());
    }
}
