package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.SessionPlatform;

public record IssueSessionCommand(
        Long userId,
        SessionPlatform platform,
        String deviceLabel,
        String userAgent,
        String ipAddress,
        boolean rememberMe
) {}
