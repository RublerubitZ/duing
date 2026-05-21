package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.entity.RoundStatus;
import java.time.LocalDateTime;

public record RecertificationRequestSummaryResponse(
        Long id,
        RoundRef round,
        ClubRef club,
        UserRef leader,
        RecertificationStatus status,
        int operatingYear,
        LocalDateTime createdAt
) {
    public record RoundRef(Long id, Integer year, String label, RoundStatus status) {}
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static RecertificationRequestSummaryResponse of(
            RecertificationRequest request, RoundRef round, ClubRef club, UserRef leader
    ) {
        return new RecertificationRequestSummaryResponse(
                request.getId(), round, club, leader,
                request.getStatus(), request.getOperatingYear(), request.getCreatedAt()
        );
    }
}
