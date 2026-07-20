package com.duing.domain.facilitysubmission.service.dto.query;

/** 제출 Batch 목록 검색 조건 — 두 필드 모두 null 허용(무필터). */
public record SubmissionBatchSearchCondition(Long facilityId, SubmissionBatchStatusFilter status) {
}
