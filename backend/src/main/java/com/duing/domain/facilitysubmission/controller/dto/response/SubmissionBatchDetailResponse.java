package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionAuditEntry;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.List;

public record SubmissionBatchDetailResponse(
        SubmissionBatchSummaryResponse batch,
        List<SubmissionCandidatesResponse.Booking> bookings,
        List<SubmissionAuditResponse> audits
) {
    /** adminName 은 탈퇴 관리자 시 null 일 수 있다(record String 기본 nullable — 계약상 허용). */
    public record SubmissionAuditResponse(
            String action, String adminName, Instant createdAt, String ipAddress, String detail) {
        public static SubmissionAuditResponse from(SubmissionAuditEntry entry) {
            // createdAt 은 JPA 감사(JVM 기본 존 wall-clock) 기록값 — system 변환.
            return new SubmissionAuditResponse(entry.action().name(), entry.adminName(),
                    TimeMapper.systemWallClockToInstant(entry.createdAt()), entry.ipAddress(), entry.detail());
        }
    }

    public static SubmissionBatchDetailResponse from(SubmissionBatchDetailResult detailResult) {
        return new SubmissionBatchDetailResponse(
                SubmissionBatchSummaryResponse.from(detailResult.batch()),
                detailResult.bookings().stream().map(SubmissionCandidatesResponse.Booking::from).toList(),
                detailResult.audits().stream().map(SubmissionAuditResponse::from).toList());
    }
}
