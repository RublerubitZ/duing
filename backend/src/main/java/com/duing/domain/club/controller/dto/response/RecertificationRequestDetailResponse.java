package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import java.time.LocalDateTime;
import java.util.List;

public record RecertificationRequestDetailResponse(
        Long id,
        RoundRef round,
        ClubRef club,
        UserRef currentLeader,
        List<UserRef> officers,
        UserRef submittedLeader,
        String contactEmail,
        String contactPhone,
        int operatingYear,
        String notes,
        RecertificationStatus status,
        String actionNote,
        UserRef handledBy,
        LocalDateTime handledAt,
        LocalDateTime createdAt,
        List<ClubMemberHistoryResponse> recentMemberHistory
) {
    public record RoundRef(Long id, Integer year, String label) {}
    public record ClubRef(Long id, String name, Integer lastVerifiedYear) {}
    public record UserRef(Long id, String name) {}

    public static RecertificationRequestDetailResponse of(
            RecertificationRequest request, RoundRef round, ClubRef club,
            UserRef currentLeader, List<UserRef> officers, UserRef submittedLeader,
            UserRef handler, List<ClubMemberHistoryResponse> recentMemberHistory
    ) {
        return new RecertificationRequestDetailResponse(
                request.getId(), round, club, currentLeader, officers, submittedLeader,
                request.getContactEmail(), request.getContactPhone(), request.getOperatingYear(),
                request.getNotes(), request.getStatus(), request.getActionNote(),
                handler, request.getHandledAt(), request.getCreatedAt(),
                recentMemberHistory
        );
    }
}
