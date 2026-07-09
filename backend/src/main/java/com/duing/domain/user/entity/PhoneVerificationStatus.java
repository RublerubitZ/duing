package com.duing.domain.user.entity;

/** MO 인증 세션의 파생 상태 — DB 컬럼이 아니라 시각 기준 계산값이다 (spec §5.1). */
public enum PhoneVerificationStatus {
    PENDING, VERIFIED, EXPIRED
}
