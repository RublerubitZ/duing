package com.duing.domain.facilitybooking.service;

public interface FacilityBookingAdminService {

    /** 승인 — 시설 행 잠금 + 저장 스냅샷 재검증(§5.2). PENDING·CONFLICT(재승인)에서만. */
    void approve(Long adminId, Long bookingId);

    void reject(Long adminId, Long bookingId, String reason);

    /** 자동 매칭 불발분의 수동 확정 — APPROVED 에서만. */
    void confirmManually(Long adminId, Long bookingId);

    /** 승인 후 학교 충돌 수동 전환(P1 — 자동 전환은 P2). */
    void markConflict(Long adminId, Long bookingId, String detail);

    /** 관리자 취소 — APPROVED·CONFLICT 에서. 사유는 이력에만 기록. */
    void cancel(Long adminId, Long bookingId, String reason);
}
