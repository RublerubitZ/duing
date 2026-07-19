package com.duing.domain.facilitysubmission.service.dto.query;

import java.time.LocalDateTime;

/** 이력 행이자 상세 헤더(스펙 §5.3·§5.4). */
public record SubmissionBatchListItem(
        Long batchId,
        String submissionNo,
        Long facilityId,
        String facilityName,
        long bookingCount,
        LocalDateTime submittedAt,
        String submittedByName,
        String memo,
        boolean cancelled,
        LocalDateTime cancelledAt
) {
}
