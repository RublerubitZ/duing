package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.user.entity.College;
import java.util.List;

public record ClubSummaryQuery(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String logoUrl,
        ClubStatus status,
        List<String> tags
) {
    public static ClubSummaryQuery from(Club club) {
        return new ClubSummaryQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getCollege(),
                club.getLogoUrl(),
                club.getStatus(),
                club.getTags()
        );
    }
}
