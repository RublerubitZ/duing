package com.duing.domain.joincode.service.dto.command;

import java.util.List;

public record BulkApproveJoinRequestsCommand(
        Long clubId,
        List<Long> joinRequestIds,
        Long requesterId
) {
}
