package com.duing.domain.facilitysubmission.service.dto.query;

/**
 * 제출 Batch 파생 상태 필터(개편 스펙 A3) — Batch 는 상태 컬럼 없이 cancelledAt/completedAt 로 상태를
 * 파생한다(취소 > 완료 > 제출 대기 우선순위, FE deriveBatchStatus 와 동일 규칙).
 *
 * ARCHIVED 는 "제출 이력"(완료 + 취소) 복합 필터다. 제출 이력 탭이 REVIEWING 을 빼고 지난 배치만
 * 페이지네이션으로 받기 위한 것으로, 클라이언트 필터링은 totalPages 와 표시 수가 어긋나 페이저가 깨진다.
 */
public enum SubmissionBatchStatusFilter {
    REVIEWING, COMPLETED, CANCELLED, ARCHIVED
}
