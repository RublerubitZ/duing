package com.duing.domain.facilitysubmission.service.dto.query;

import java.time.LocalDateTime;
import java.util.List;

/** 이력 행이자 상세 헤더(스펙 §5.3·§5.4). facilityId/facilityName 은 legacy(시설 단위) 배치 전용(v2 §2). */
public record SubmissionBatchListItem(
        Long batchId,
        String submissionNo,
        Long facilityId,
        String facilityName,
        List<String> facilityNames,
        long bookingCount,
        List<String> clubNames,
        LocalDateTime submittedAt,
        String submittedByName,
        String memo,
        boolean cancelled,
        LocalDateTime cancelledAt,
        boolean completed,
        LocalDateTime completedAt
) {
}
