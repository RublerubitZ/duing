package com.duing.domain.user.entity;

/** 감사 이벤트 종류 — VERIFIED(인증 성공), CONSUMED(용도 완료 — 가입은 PR2, 번호변경·재설정은 PR4 에서 기록). */
public enum PhoneVerificationEventType {
    VERIFIED, CONSUMED
}
