package com.duing.domain.notification.event;

/** 시설 예약 확정(스펙 §7.6) — 수동 확정·매칭 잡 자동 확정 공용. 신청 동아리 운영진 알림용. */
public record FacilityBookingConfirmedEvent(Long bookingId, Long clubId, Long historyId) {
}
