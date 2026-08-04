package com.duing.domain.joincode.service.dto.query;

import java.util.List;

/**
 * 일괄 승인 결과. 건별 트랜잭션이므로 성공 수와 실패 사유를 함께 돌려줘
 * 운영진이 어떤 요청이 왜 처리되지 못했는지 즉시 알 수 있게 한다.
 */
public record BulkApproveJoinRequestsResult(
        int approvedCount,
        List<Failure> failures
) {
    public record Failure(Long joinRequestId, String reason) {
    }
}
