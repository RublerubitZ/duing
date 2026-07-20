package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.service.dto.query.SuccessionRequestAdminDetailQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record SuccessionRequestDetailResponse(
        Long id,
        ClubRef club,
        UserRef requester,
        UserRef currentLeader,
        String reason,
        SuccessionStatus status,
        String actionNote,
        UserRef handledBy,
        Instant handledAt,
        Instant createdAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static SuccessionRequestDetailResponse of(
            LeaderSuccessionRequest request,
            ClubRef club, UserRef requester, UserRef currentLeader, UserRef handler
    ) {
        return new SuccessionRequestDetailResponse(
                request.getId(), club, requester, currentLeader,
                request.getReason(), request.getStatus(), request.getActionNote(),
                handler,
                TimeMapper.systemWallClockToInstant(request.getHandledAt()),
                TimeMapper.systemWallClockToInstant(request.getCreatedAt())
        );
    }

    public static SuccessionRequestDetailResponse from(SuccessionRequestAdminDetailQuery query) {
        ClubRef clubRef = new ClubRef(query.club().id(), query.club().name());
        UserRef requesterRef = query.requester() == null ? null
                : new UserRef(query.requester().id(), query.requester().name());
        UserRef currentLeaderRef = query.currentLeader() == null ? null
                : new UserRef(query.currentLeader().id(), query.currentLeader().name());
        UserRef handledByRef = query.handledBy() == null ? null
                : new UserRef(query.handledBy().id(), query.handledBy().name());
        return new SuccessionRequestDetailResponse(
                query.id(), clubRef, requesterRef, currentLeaderRef,
                query.reason(), query.status(), query.actionNote(),
                handledByRef,
                TimeMapper.systemWallClockToInstant(query.handledAt()),
                TimeMapper.systemWallClockToInstant(query.createdAt())
        );
    }
}
