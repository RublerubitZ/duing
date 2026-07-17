package com.duing.domain.notification.event;

/** 관리자 취소(스펙 §7.6 확장 — 2026-07-17 감사로 열린 CONFIRMED 취소 포함) — 신청 동아리 운영진 알림용. */
public record FacilityBookingCancelledEvent(Long bookingId, Long clubId, Long historyId, String reason) {
}
