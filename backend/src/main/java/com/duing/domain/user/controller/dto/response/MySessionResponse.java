package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.SessionSummary;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record MySessionResponse(
        Long sessionId,
        String platform,
        String deviceLabel,
        Instant lastUsedAt,
        boolean current
) {
    public static MySessionResponse from(SessionSummary sessionSummary) {
        return new MySessionResponse(
                sessionSummary.sessionId(),
                sessionSummary.platform().name(),
                sessionSummary.deviceLabel(),
                TimeMapper.seoulWallClockToInstant(sessionSummary.lastUsedAt()),
                sessionSummary.current());
    }
}
