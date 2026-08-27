package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.user.entity.College;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.List;

public record AdminClubSummaryResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String logoUrl,
        ClubStatus status,
        List<String> tags,
        Long leaderId,
        String leaderName,
        String leaderStudentId,
        boolean centralClub,
        boolean facilitySecuredTimeTarget,
        String rejectionReason,
        Instant statusChangedAt,
        String statusChangedByName
) {
    public static AdminClubSummaryResponse from(AdminClubSummaryQuery summaryQuery) {
        return new AdminClubSummaryResponse(
                summaryQuery.id(),
                summaryQuery.name(),
                summaryQuery.category(),
                summaryQuery.division(),
                summaryQuery.college(),
                summaryQuery.logoUrl(),
                summaryQuery.status(),
                summaryQuery.tags(),
                summaryQuery.leaderId(),
                summaryQuery.leaderName(),
                summaryQuery.leaderStudentId(),
                summaryQuery.centralClub(),
                summaryQuery.facilitySecuredTimeTarget(),
                summaryQuery.rejectionReason(),
                TimeMapper.systemWallClockToInstant(summaryQuery.statusChangedAt()),
                summaryQuery.statusChangedByName()
        );
    }
}
