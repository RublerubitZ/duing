package com.duing.domain.notification.event;

/** 시설 예약 승인(스펙 §7.6) — 신청 동아리 운영진 알림용. historyId = 전이 인스턴스 단위 dedup 키 재료. */
public record FacilityBookingApprovedEvent(Long bookingId, Long clubId, Long historyId) {
}
