package com.duing.domain.notification.event;

/** 시설 예약 거절(스펙 §7.6) — 신청 동아리 운영진 알림용. 사유는 본문에 그대로 노출된다. */
public record FacilityBookingRejectedEvent(Long bookingId, Long clubId, Long historyId, String reason) {
}
