package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;

public record ClubSummaryQuery(
        Long id,
        String name,
        ClubCategory category,
        String division,
        String logoUrl,
        ClubStatus status
) {
    public static ClubSummaryQuery from(Club club) {
        return new ClubSummaryQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getLogoUrl(),
                club.getStatus()
        );
    }
}
