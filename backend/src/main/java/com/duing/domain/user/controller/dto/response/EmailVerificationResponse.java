package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.EmailVerificationSendResult;
import java.time.LocalDateTime;

public record EmailVerificationResponse(
        LocalDateTime expiresAt,
        long expiresInSeconds
) {
    public static EmailVerificationResponse from(EmailVerificationSendResult sendResult) {
        return new EmailVerificationResponse(sendResult.expiresAt(), sendResult.expiresInSeconds());
    }
}
