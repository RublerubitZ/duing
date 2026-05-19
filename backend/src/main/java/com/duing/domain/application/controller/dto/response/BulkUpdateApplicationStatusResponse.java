package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.service.dto.query.BulkUpdateApplicationStatusResult;
import java.util.List;

public record BulkUpdateApplicationStatusResponse(
        int updated,
        List<FailureResponse> failures
) {
    public record FailureResponse(Long applicationId, String reason) {
        public static FailureResponse from(BulkUpdateApplicationStatusResult.Failure failure) {
            return new FailureResponse(failure.applicationId(), failure.reason());
        }
    }

    public static BulkUpdateApplicationStatusResponse from(BulkUpdateApplicationStatusResult result) {
        return new BulkUpdateApplicationStatusResponse(
                result.updated(),
                result.failures().stream().map(FailureResponse::from).toList()
        );
    }
}