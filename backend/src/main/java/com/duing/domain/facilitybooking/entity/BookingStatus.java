package com.duing.domain.facilitybooking.entity;

/**
 * 대관 신청 상태 머신(설계 §4). PENDING → APPROVED → CONFIRMED 이 정상 경로,
 * 승인 후 학교 데이터 충돌만 CONFLICT 를 쓴다. CONFIRMED 탈출은 관리자 취소
 * (학교 측 취소·오확정 정정 복구 경로) 하나만 허용된다.
 */
public enum BookingStatus {
    PENDING,
    APPROVED,
    CONFIRMED,
    REJECTED,
    CONFLICT,
    CANCELLED;

    /** 가용성 계산에서 슬롯을 하드 차단하는 상태 — BLOCKED(INTERNAL) 대상(설계 §3.1). */
    public boolean blocksSlot() {
        return this == APPROVED || this == CONFIRMED;
    }

    /** 동아리당 활성 신청 상한 집계 대상(설계 §3.3). */
    public boolean countsTowardActiveCap() {
        return this == PENDING || this == APPROVED;
    }

    public boolean isTerminal() {
        return this == REJECTED || this == CANCELLED;
    }
}
