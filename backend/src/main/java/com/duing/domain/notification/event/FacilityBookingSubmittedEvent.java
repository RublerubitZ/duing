package com.duing.domain.notification.event;

/** 시설 예약 신청 접수(스펙 §7.6) — ADMIN 전원 알림용. */
public record FacilityBookingSubmittedEvent(Long bookingId, Long clubId) {
}
