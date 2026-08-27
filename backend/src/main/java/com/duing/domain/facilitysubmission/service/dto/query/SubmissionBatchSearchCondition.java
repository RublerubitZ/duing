package com.duing.domain.facilitysubmission.service.dto.query;

/** 제출 Batch 목록 검색 조건 — null 허용(무필터). 시설 필터는 동아리 단위 전환(v2)에서 제거(FE 미사용). */
public record SubmissionBatchSearchCondition(SubmissionBatchStatusFilter status) {
}
