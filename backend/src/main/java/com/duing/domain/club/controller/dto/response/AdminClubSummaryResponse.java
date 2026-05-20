package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import java.time.LocalDateTime;
import java.util.List;

public record AdminClubSummaryResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        String logoUrl,
        ClubStatus status,
        List<String> tags,
        Long leaderId,
        String leaderName,
        String leaderStudentId,
        boolean centralClub,
        String rejectionReason,
        LocalDateTime statusChangedAt,
        String statusChangedByName
) {
    public static AdminClubSummaryResponse from(AdminClubSummaryQuery summaryQuery) {
        return new AdminClubSummaryResponse(
                summaryQuery.id(),
                summaryQuery.name(),
                summaryQuery.category(),
                summaryQuery.division(),
                summaryQuery.logoUrl(),
                summaryQuery.status(),
                summaryQuery.tags(),
                summaryQuery.leaderId(),
                summaryQuery.leaderName(),
                summaryQuery.leaderStudentId(),
                summaryQuery.centralClub(),
                summaryQuery.rejectionReason(),
                summaryQuery.statusChangedAt(),
                summaryQuery.statusChangedByName()
        );
    }
}
