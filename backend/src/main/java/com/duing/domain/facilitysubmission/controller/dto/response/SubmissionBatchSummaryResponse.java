package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchListItem;
import java.time.LocalDateTime;

public record SubmissionBatchSummaryResponse(
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
    public static SubmissionBatchSummaryResponse from(SubmissionBatchListItem listItem) {
        return new SubmissionBatchSummaryResponse(listItem.batchId(), listItem.submissionNo(),
                listItem.facilityId(), listItem.facilityName(), listItem.bookingCount(), listItem.submittedAt(),
                listItem.submittedByName(), listItem.memo(), listItem.cancelled(), listItem.cancelledAt());
    }
}
