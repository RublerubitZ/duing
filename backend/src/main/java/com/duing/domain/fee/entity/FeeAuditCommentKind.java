package com.duing.domain.fee.entity;

/** 총동연이 동아리에 남기는 텍스트의 종류(스펙 §3.2). 상태 워크플로는 의견에만 있다. */
public enum FeeAuditCommentKind {

    /** 감사 의견 — OPEN/IN_REVIEW/RESOLVED 로 처리 상태를 따라간다. */
    AUDIT_OPINION,
    /** 운영 메모 — 자유 기록이라 상태를 갖지 않는다. */
    OPERATION_MEMO
}
