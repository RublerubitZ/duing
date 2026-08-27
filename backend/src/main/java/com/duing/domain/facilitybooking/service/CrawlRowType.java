package com.duing.domain.facilitybooking.service;

/**
 * 크롤 행 분류(§3.2). 확보 시간 비차단 전환(2026-08-27): 차단 판정은 분류를 따른다 —
 * CRAWLED_RESERVATION 만 겹치는 슬롯을 차단하고 BASIC_SECURED_TIME 은 비차단이다
 * ({@link FacilityAvailabilityPolicy#blockingOverlapping} 소관). 분류 실패(이름 충돌 P5·미등록)는
 * CRAWLED_RESERVATION 폴백이라 차단 유지 방향(fail-closed)이다.
 */
public enum CrawlRowType {
    /** 학교 크롤 실예약(기본값) — 미등록 동아리·학교 행사·부서·기관·매칭 실패 전부 포함. 겹치는 슬롯을 차단한다. */
    CRAWLED_RESERVATION,
    /** 총동연이 "기본 확보 시간 대상"으로 지정한 동아리의 크롤 예약 — 차단하지 않는다(다른 동아리도 신청 가능). */
    BASIC_SECURED_TIME
}
