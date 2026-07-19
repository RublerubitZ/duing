package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import java.util.List;

public record SubmissionBatchDetailResponse(
        SubmissionBatchSummaryResponse batch,
        List<SubmissionCandidatesResponse.Booking> bookings
) {
    public static SubmissionBatchDetailResponse from(SubmissionBatchDetailResult detailResult) {
        return new SubmissionBatchDetailResponse(
                SubmissionBatchSummaryResponse.from(detailResult.batch()),
                detailResult.bookings().stream().map(SubmissionCandidatesResponse.Booking::from).toList());
    }
}
