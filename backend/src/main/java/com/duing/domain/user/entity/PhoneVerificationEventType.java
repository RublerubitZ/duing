package com.duing.domain.user.entity;

/** 감사 이벤트 종류 — VERIFIED(인증 성공), CONSUMED(용도 완료 — 가입·번호변경·재설정 시 기록). */
public enum PhoneVerificationEventType {
    VERIFIED, CONSUMED
}
