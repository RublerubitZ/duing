package com.duing.domain.user.service.dto.query;

import java.time.LocalDateTime;

/** qrCode 는 요청 시(includeQr)에만 채워지며 발급 실패 시 null — 프론트가 텍스트 안내로 폴백한다. */
public record PhoneVerificationIssueResult(
        String verificationToken,
        String code,
        String moNumber,
        String qrCode,
        LocalDateTime expiresAt,
        long expiresInSeconds
) {
}
