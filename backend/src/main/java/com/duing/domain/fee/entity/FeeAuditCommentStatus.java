package com.duing.domain.fee.entity;

/**
 * 감사 의견 처리 상태(스펙 §7.10). {@code OPEN → IN_REVIEW → RESOLVED} 가 기본 흐름이지만
 * 전이 제약은 두지 않는다 — 완료한 의견을 다시 열어야 하는 경우가 실제로 있다.
 */
public enum FeeAuditCommentStatus {

    /** 진행중 — 생성 시 기본값. */
    OPEN,
    /** 확인중. */
    IN_REVIEW,
    /** 완료. */
    RESOLVED
}
