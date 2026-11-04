package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.service.dto.query.ClubPendingCleanupResult;

public record AdminClubPendingCleanupResponse(
        int rejectedApplicationCount,
        int rejectedJoinRequestCount
) {
    public static AdminClubPendingCleanupResponse from(ClubPendingCleanupResult cleanupResult) {
        return new AdminClubPendingCleanupResponse(
                cleanupResult.rejectedApplicationCount(),
                cleanupResult.rejectedJoinRequestCount()
        );
    }
}
