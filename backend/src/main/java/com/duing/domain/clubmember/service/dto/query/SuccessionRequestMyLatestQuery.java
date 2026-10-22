package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import java.time.LocalDateTime;

public record SuccessionRequestMyLatestQuery(
        Long requestId,
        SuccessionStatus status,
        String reason,
        String actionNote,
        LocalDateTime createdAt,
        LocalDateTime handledAt
) {
    public static SuccessionRequestMyLatestQuery from(LeaderSuccessionRequest request) {
        return new SuccessionRequestMyLatestQuery(
                request.getId(), request.getStatus(), request.getReason(),
                request.getActionNote(), request.getCreatedAt(), request.getHandledAt());
    }
}
