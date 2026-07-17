package com.duing.domain.notification.event;

/** 시설 예약 충돌 전환(스펙 §7.6) — ADMIN 전원 + 신청 동아리 운영진 알림용. */
public record FacilityBookingConflictEvent(Long bookingId, Long clubId, Long historyId, String detail) {
}
