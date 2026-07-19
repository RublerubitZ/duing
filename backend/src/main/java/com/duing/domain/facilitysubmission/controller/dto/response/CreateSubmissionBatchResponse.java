package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;

public record CreateSubmissionBatchResponse(Long batchId, String submissionNo, String csvFileName) {

    public static CreateSubmissionBatchResponse from(CreateSubmissionBatchResult result) {
        return new CreateSubmissionBatchResponse(result.batchId(), result.submissionNo(), result.csvFileName());
    }
}
