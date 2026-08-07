package com.duing.domain.fee.service.dto.query;

/** 회비 사용 여부 필터(스펙 §15 결정 7 — 활성 정책 ≥1 또는 청구 이력 ≥1 이면 사용 중). */
public enum AdminFeeUsageFilter {
    USING, NOT_USING
}
