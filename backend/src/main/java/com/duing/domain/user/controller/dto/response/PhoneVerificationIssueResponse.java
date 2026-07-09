package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import java.time.LocalDateTime;

public record PhoneVerificationIssueResponse(
        String verificationToken,
        String code,
        String moNumber,
        String qrCode,
        LocalDateTime expiresAt,
        long expiresInSeconds
) {
    public static PhoneVerificationIssueResponse from(PhoneVerificationIssueResult issueResult) {
        return new PhoneVerificationIssueResponse(
                issueResult.verificationToken(), issueResult.code(), issueResult.moNumber(),
                issueResult.qrCode(), issueResult.expiresAt(), issueResult.expiresInSeconds());
    }
}
