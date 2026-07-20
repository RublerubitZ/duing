package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionAuditEntry;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import java.time.LocalDateTime;
import java.util.List;

public record SubmissionBatchDetailResponse(
        SubmissionBatchSummaryResponse batch,
        List<SubmissionCandidatesResponse.Booking> bookings,
        List<SubmissionAuditResponse> audits
) {
    /** adminName 은 탈퇴 관리자 시 null 일 수 있다(record String 기본 nullable — 계약상 허용). */
    public record SubmissionAuditResponse(
            String action, String adminName, LocalDateTime createdAt, String ipAddress, String detail) {
        public static SubmissionAuditResponse from(SubmissionAuditEntry entry) {
            return new SubmissionAuditResponse(entry.action().name(), entry.adminName(),
                    entry.createdAt(), entry.ipAddress(), entry.detail());
        }
    }

    public static SubmissionBatchDetailResponse from(SubmissionBatchDetailResult detailResult) {
        return new SubmissionBatchDetailResponse(
                SubmissionBatchSummaryResponse.from(detailResult.batch()),
                detailResult.bookings().stream().map(SubmissionCandidatesResponse.Booking::from).toList(),
                detailResult.audits().stream().map(SubmissionAuditResponse::from).toList());
    }
}
