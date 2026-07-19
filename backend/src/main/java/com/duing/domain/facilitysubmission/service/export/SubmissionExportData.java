package com.duing.domain.facilitysubmission.service.export;

import java.util.List;

/** 포맷 중립 제출 데이터(스펙 §6) — Writer 는 이 데이터만 소비하므로 포맷 추가 시 Assembler 무변경. */
public record SubmissionExportData(
        String submissionNo,
        String facilityName,
        String memo,
        String csvFileName,
        List<SubmissionExportRow> rows
) {
}
