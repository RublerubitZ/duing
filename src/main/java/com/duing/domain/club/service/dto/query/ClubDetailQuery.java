package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;

public record ClubDetailQuery(
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
    public static ClubDetailQuery from(Club club) {
        return new ClubDetailQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getDescription(),
                club.getLogoUrl(),
                club.getLeader() != null ? club.getLeader().getId() : null,
                club.getLeader() != null ? club.getLeader().getName() : null,
                club.getStatus()
        );
    }
}
