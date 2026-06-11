package com.duing.domain.interview.entity;

/**
 * InterviewRound 상태머신 (스펙 §5.1):
 * DRAFT → (발송) → COLLECTING → (자동배정) → ASSIGNING → (확정) → SCHEDULED(터미널)
 * DRAFT|COLLECTING|ASSIGNING → CANCELLED(터미널). ASSIGNING→COLLECTING 복귀 없음.
 * SCHEDULED 는 member.ASSIGNED 와의 이름 충돌을 피하고 future COMPLETED 확장 여지를 남긴 명명.
 */
public enum RoundStatus {
    DRAFT,
    COLLECTING,
    ASSIGNING,
    SCHEDULED,
    CANCELLED
}
