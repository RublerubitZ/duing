package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.PasswordResetStartResult;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record PasswordResetStartResponse(
        String verificationToken,
        String code,
        String moNumber,
        String qrCode,
        Instant expiresAt,
        long expiresInSeconds,
        String maskedPhone
) {
    public static PasswordResetStartResponse from(PasswordResetStartResult startResult) {
        var issueResult = startResult.issueResult();
        return new PasswordResetStartResponse(
                issueResult.verificationToken(), issueResult.code(), issueResult.moNumber(),
                issueResult.qrCode(),
                TimeMapper.seoulWallClockToInstant(issueResult.expiresAt()),
                issueResult.expiresInSeconds(),
                startResult.maskedPhone());
    }
}
