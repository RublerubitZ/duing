package com.duing.domain.adminconsole.service.dto.query;

/** 총동연 홈 자동 작업 한 줄의 화면 상태 — 판정은 AdminJobStatusQueryService 가 한다(스펙 §3-3). */
public enum JobHealth {
    OK,
    PARTIAL,
    FAILED,
    OVERDUE,
    NOT_YET,
    DISABLED
}
