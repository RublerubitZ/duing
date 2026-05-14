package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;

public record ClubDetailResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        Long leaderId,
        String leaderName,
        ClubStatus status
) {
    public static ClubDetailResponse from(ClubDetailQuery detailQuery) {
        return new ClubDetailResponse(
                detailQuery.id(),
                detailQuery.name(),
                detailQuery.category(),
                detailQuery.division(),
                detailQuery.description(),
                detailQuery.logoUrl(),
                detailQuery.leaderId(),
                detailQuery.leaderName(),
                detailQuery.status()
        );
    }
}
