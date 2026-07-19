package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.SessionSummary;
import java.time.LocalDateTime;

public record MySessionResponse(
        Long sessionId,
        String platform,
        String deviceLabel,
        LocalDateTime lastUsedAt,
        LocalDateTime createdAt,
        boolean current
) {
    public static MySessionResponse from(SessionSummary sessionSummary) {
        return new MySessionResponse(
                sessionSummary.sessionId(),
                sessionSummary.platform().name(),
                sessionSummary.deviceLabel(),
                sessionSummary.lastUsedAt(),
                sessionSummary.createdAt(),
                sessionSummary.current());
    }
}
