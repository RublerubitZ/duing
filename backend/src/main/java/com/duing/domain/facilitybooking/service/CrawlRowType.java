package com.duing.domain.facilitybooking.service;

/**
 * 크롤 행 분류(전면 차단 설계 §3.2). 두 분류 모두 겹치는 슬롯을 차단하며(P1·P3), 차이는 관리·표시
 * 의미뿐이다 — 차단 판정은 분류와 무관한 {@link FacilityAvailabilityPolicy#blockingOverlapping} 소관이라
 * 분류가 어떻게 되든 차단이 풀리지 않는다(fail-closed).
 */
public enum CrawlRowType {
    /** 학교 크롤 실예약(기본값) — 미등록 동아리·학교 행사·부서·기관·매칭 실패 전부 포함. */
    CRAWLED_RESERVATION,
    /** 총동연이 "기본 확보 시간 대상"으로 지정한 동아리의 크롤 예약 — 차단은 동일, 표시·정책 의미만 다르다. */
    BASIC_SECURED_TIME
}
