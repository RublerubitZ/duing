package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.service.dto.query.BulkApproveJoinRequestsResult;
import java.util.List;

public record BulkApproveJoinRequestsResponse(
        int approvedCount,
        List<FailureResponse> failures
) {
    public record FailureResponse(Long joinRequestId, String reason) {
        public static FailureResponse from(BulkApproveJoinRequestsResult.Failure failure) {
            return new FailureResponse(failure.joinRequestId(), failure.reason());
        }
    }

    public static BulkApproveJoinRequestsResponse from(BulkApproveJoinRequestsResult bulkResult) {
        return new BulkApproveJoinRequestsResponse(
                bulkResult.approvedCount(),
                bulkResult.failures().stream().map(FailureResponse::from).toList()
        );
    }
}
