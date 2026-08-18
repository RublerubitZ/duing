package com.duing.domain.facilitybooking.entity;

import java.util.Arrays;
import java.util.List;

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

    private static final List<BookingStatus> SLOT_BLOCKING = Arrays.stream(values())
            .filter(BookingStatus::blocksSlot)
            .toList();
    private static final List<BookingStatus> ACTIVE_CAP = Arrays.stream(values())
            .filter(BookingStatus::countsTowardActiveCap)
            .toList();
    private static final List<BookingStatus> NORMAL_PATH = List.of(PENDING, APPROVED, CONFIRMED);

    /** blocksSlot() 의 컬렉션 파생 — 슬롯 차단 판정 쿼리 IN 절용. 리터럴 재열거 금지. */
    public static List<BookingStatus> slotBlockingStatuses() {
        return SLOT_BLOCKING;
    }

    /** countsTowardActiveCap() 의 컬렉션 파생 — 활성 신청 상한 집계 쿼리용. */
    public static List<BookingStatus> activeCapStatuses() {
        return ACTIVE_CAP;
    }

    /**
     * 정상 경로(§4: PENDING → APPROVED → CONFIRMED) 위의 상태 — 클럽 중복 신청 차단·가용성
     * 슬라이스 조회용. isTerminal() 부정과 다르다: CONFLICT 는 비종결이지만 충돌 해소 대기
     * 상태라 정상 경로가 아니며, 이 집합에서 의도적으로 제외된다.
     */
    public static List<BookingStatus> normalPathStatuses() {
        return NORMAL_PATH;
    }
}
