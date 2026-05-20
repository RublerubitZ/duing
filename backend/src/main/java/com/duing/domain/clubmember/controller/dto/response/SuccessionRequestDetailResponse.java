package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import java.time.LocalDateTime;

public record SuccessionRequestDetailResponse(
        Long id,
        ClubRef club,
        UserRef requester,
        UserRef currentLeader,
        String reason,
        SuccessionStatus status,
        String actionNote,
        UserRef handledBy,
        LocalDateTime handledAt,
        LocalDateTime createdAt
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
                handler, request.getHandledAt(), request.getCreatedAt()
        );
    }
}
