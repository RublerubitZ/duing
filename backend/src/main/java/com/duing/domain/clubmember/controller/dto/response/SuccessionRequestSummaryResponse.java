package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import java.time.LocalDateTime;

public record SuccessionRequestSummaryResponse(
        Long id,
        Long clubId,
        String clubName,
        UserRef requester,
        SuccessionStatus status,
        LocalDateTime createdAt
) {
    public record UserRef(Long id, String name) {}

    public static SuccessionRequestSummaryResponse of(
            LeaderSuccessionRequest request, String clubName, UserRef requester
    ) {
        return new SuccessionRequestSummaryResponse(
                request.getId(), request.getClubId(), clubName,
                requester, request.getStatus(), request.getCreatedAt()
        );
    }
}
