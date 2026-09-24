package com.duing.domain.facilitysubmission.service.dto.query;

import java.time.LocalDate;

/**
 * 제출 Batch 목록 검색 조건 — 전부 null 허용(무필터). q 는 제출번호·메모·동아리명 부분 일치(대소문자 무시),
 * submittedFrom/To 는 KST 일 단위 생성일 범위(한쪽만 가능). 시설 필터는 v2 에서 제거(FE 미사용).
 */
public record SubmissionBatchSearchCondition(
        SubmissionBatchStatusFilter status,
        String q,
        LocalDate submittedFrom,
        LocalDate submittedTo
) {
}
