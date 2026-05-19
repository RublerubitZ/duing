package com.duing.domain.application.service.dto.command;

import com.duing.domain.application.entity.ApplicationStatus;
import java.util.List;

/**
 * 운영진이 N건의 지원서를 동일 status 로 일괄 전환할 때 쓰는 입력.
 * 처리는 건별 트랜잭션으로 이뤄지며, 한 건이 실패하더라도 나머지는 그대로 커밋된다.
 */
public record BulkUpdateApplicationStatusCommand(
        List<Long> applicationIds,
        Long currentUserId,
        ApplicationStatus status
) {
}