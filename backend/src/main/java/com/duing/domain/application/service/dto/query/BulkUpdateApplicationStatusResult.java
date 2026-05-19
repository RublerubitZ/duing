package com.duing.domain.application.service.dto.query;

import java.util.List;

/**
 * 일괄 상태 변경 결과. 성공한 행 수와 실패한 행의 사유를 함께 반환해
 * 운영자가 어떤 지원이 왜 처리되지 못했는지 즉시 알 수 있도록 한다.
 */
public record BulkUpdateApplicationStatusResult(
        int updated,
        List<Failure> failures
) {
    public record Failure(Long applicationId, String reason) {
    }
}