package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.service.dto.query.SuccessionRequestAdminSummaryQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record SuccessionRequestSummaryResponse(
        Long id,
        Long clubId,
        String clubName,
        UserRef requester,
        SuccessionStatus status,
        Instant createdAt
) {
    public record UserRef(Long id, String name) {}

    public static SuccessionRequestSummaryResponse of(
            LeaderSuccessionRequest request, String clubName, UserRef requester
    ) {
        return new SuccessionRequestSummaryResponse(
                request.getId(), request.getClubId(), clubName,
                requester, request.getStatus(),
                TimeMapper.systemWallClockToInstant(request.getCreatedAt())
        );
    }

    public static SuccessionRequestSummaryResponse from(SuccessionRequestAdminSummaryQuery query) {
        UserRef requesterRef = new UserRef(query.requester().id(), query.requester().name());
        return new SuccessionRequestSummaryResponse(
                query.id(), query.clubId(), query.clubName(),
                requesterRef, query.status(),
                TimeMapper.systemWallClockToInstant(query.createdAt())
        );
    }
}
