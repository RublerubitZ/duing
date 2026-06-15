package com.duing.domain.user.service.dto.query;

import java.time.LocalDateTime;

public record EmailVerificationSendResult(
        LocalDateTime expiresAt,
        long expiresInSeconds
) {}
