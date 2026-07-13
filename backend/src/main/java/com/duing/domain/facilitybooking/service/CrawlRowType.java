package com.duing.domain.facilitybooking.service;

/**
 * 크롤 행 분류(설계 §3.1 0단계). 확장 가능 — 향후 학교 데이터에 별도 "예약 불가 행" 유형이
 * 생기면 새 타입을 추가하고 FacilityAvailabilityPolicy 만 수정한다.
 */
public enum CrawlRowType {
    /** 실제 예약(점유) — 겹치는 슬롯 신청 불가. */
    OCCUPIED,
    /** 상시 운영 단체의 개방 시간 — 어떤 슬롯도 막지 않고 정보 라벨로만 노출. */
    OPERATING
}
