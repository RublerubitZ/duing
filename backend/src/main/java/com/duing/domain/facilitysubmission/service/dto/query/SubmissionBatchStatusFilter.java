package com.duing.domain.facilitysubmission.service.dto.query;

/**
 * 제출 Batch 파생 상태 필터(개편 스펙 A3) — Batch 는 상태 컬럼 없이 cancelledAt/completedAt 로 상태를
 * 파생한다(취소 > 완료 > 제출 대기 우선순위, FE deriveBatchStatus 와 동일 규칙).
 */
public enum SubmissionBatchStatusFilter {
    REVIEWING, COMPLETED, CANCELLED
}
