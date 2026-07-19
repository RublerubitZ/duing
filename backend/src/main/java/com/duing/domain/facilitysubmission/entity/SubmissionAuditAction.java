package com.duing.domain.facilitysubmission.entity;

/** 감사 대상 이벤트(스펙 §2) — 이 4개 외(목록 조회 등)는 기록하지 않는다. */
public enum SubmissionAuditAction {
    CREATED,
    CANCELLED,
    CSV_DOWNLOADED,
    VIEWED
}
