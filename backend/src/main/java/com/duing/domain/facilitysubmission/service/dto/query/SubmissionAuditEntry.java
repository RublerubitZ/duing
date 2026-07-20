package com.duing.domain.facilitysubmission.service.dto.query;

import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import java.time.LocalDateTime;

/** 상세 화면의 감사 이력 행(스펙 §5.4) — COMPLETED 행은 사람이 읽는 요약(detail)을 그대로 노출한다. */
public record SubmissionAuditEntry(
        SubmissionAuditAction action,
        String adminName,
        LocalDateTime createdAt,
        String ipAddress,
        String detail
) {
}
