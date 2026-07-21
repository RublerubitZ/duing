package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record PhoneVerificationIssueResponse(
        String verificationToken,
        String code,
        String moNumber,
        String qrCode,
        Instant expiresAt,
        long expiresInSeconds
) {
    public static PhoneVerificationIssueResponse from(PhoneVerificationIssueResult issueResult) {
        return new PhoneVerificationIssueResponse(
                issueResult.verificationToken(), issueResult.code(), issueResult.moNumber(),
                issueResult.qrCode(),
                TimeMapper.seoulWallClockToInstant(issueResult.expiresAt()),
                issueResult.expiresInSeconds());
    }
}
