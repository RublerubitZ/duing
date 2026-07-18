package com.duing.domain.user.service.dto.query;

/** 로그인 세션 발급 결과 — refreshToken 은 원문(1회성 응답용, 저장 금지). */
public record IssuedSession(Long sessionId, String refreshToken) {}
