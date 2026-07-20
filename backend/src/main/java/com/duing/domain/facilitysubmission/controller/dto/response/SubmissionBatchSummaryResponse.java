package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchListItem;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record SubmissionBatchSummaryResponse(
        Long batchId,
        String submissionNo,
        Long facilityId,
        String facilityName,
        long bookingCount,
        Instant submittedAt,
        String submittedByName,
        String memo,
        boolean cancelled,
        Instant cancelledAt,
        boolean completed,
        Instant completedAt
) {
    public static SubmissionBatchSummaryResponse from(SubmissionBatchListItem listItem) {
        // submittedAt/cancelledAt/completedAt 은 모두 seoulClock(KST wall-clock) 기록값이다.
        return new SubmissionBatchSummaryResponse(listItem.batchId(), listItem.submissionNo(),
                listItem.facilityId(), listItem.facilityName(), listItem.bookingCount(),
                TimeMapper.seoulWallClockToInstant(listItem.submittedAt()),
                listItem.submittedByName(), listItem.memo(), listItem.cancelled(),
                TimeMapper.seoulWallClockToInstant(listItem.cancelledAt()),
                listItem.completed(), TimeMapper.seoulWallClockToInstant(listItem.completedAt()));
    }
}
