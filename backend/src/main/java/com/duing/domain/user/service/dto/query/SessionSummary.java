package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.SessionPlatform;
import java.time.LocalDateTime;

/** 세션 목록 항목 (spec §13) — current 는 요청 access 토큰의 sid 와 일치 여부. */
public record SessionSummary(
        Long sessionId,
        SessionPlatform platform,
        String deviceLabel,
        LocalDateTime lastUsedAt,
        boolean current
) {}
