package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.PhoneVerificationStatus;

/** 폴링 응답 — status 판정 시각 기준의 남은 초와 마스킹 번호를 함께 담는다. */
public record PhoneVerificationStatusResult(
        PhoneVerificationStatus status,
        long expiresInSeconds,
        String maskedPhone
) {
}
