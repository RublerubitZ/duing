package com.duing.domain.facilitybooking.service;

/** 어드민 크롤 예약 현황의 정리 기준(수정 1). 기본값은 CLUB(동아리별). */
public enum AdminCrawlGroupBy {
    /** 동아리별 — 매칭 동아리 중심으로 묶되 미매칭 주체(행사·부서·기관)도 별도 그룹으로 반드시 표시. */
    CLUB,
    /** 시설별. */
    FACILITY,
    /** 시설 + 날짜별(기존 평면 열람 방식). */
    FACILITY_DATE
}
