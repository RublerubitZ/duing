package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.user.entity.College;
import java.util.List;

public record ClubSummaryResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String logoUrl,
        ClubStatus status,
        List<String> tags
) {
    public static ClubSummaryResponse from(ClubSummaryQuery summaryQuery) {
        return new ClubSummaryResponse(
                summaryQuery.id(),
                summaryQuery.name(),
                summaryQuery.category(),
                summaryQuery.division(),
                summaryQuery.college(),
                summaryQuery.logoUrl(),
                summaryQuery.status(),
                summaryQuery.tags()
        );
    }
}
