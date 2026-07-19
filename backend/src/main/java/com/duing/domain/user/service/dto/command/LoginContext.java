package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.SessionPlatform;

/** 로그인 요청의 세션 메타데이터 — transport(웹/모바일)별 구성은 컨트롤러 책임. */
public record LoginContext(
        String clientIp,
        String userAgent,
        SessionPlatform platform,
        String deviceLabel,
        boolean rememberMe
) {}
