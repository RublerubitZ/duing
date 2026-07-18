package com.duing.domain.user.service.dto.query;

/** Rotation 결과 — refreshToken 은 원문(응답 전용), rememberMe 는 웹 쿠키 지속성 복원용 (spec §10.1). */
public record RotationResult(
        String accessToken,
        String refreshToken,
        String role,
        boolean rememberMe
) {}
