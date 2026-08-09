package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.user.entity.College;
import java.time.LocalDate;
import java.util.List;

public record ClubSummaryQuery(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String department,
        String logoUrl,
        ClubStatus status,
        List<String> tags,
        String tagline,
        boolean centralClub,
        ActiveRecruitmentSummary activeRecruitment
) {
    public record ActiveRecruitmentSummary(
            Long recruitmentId,
            RecruitmentDisplayStatus displayStatus,
            LocalDate startDate,
            LocalDate endDate
    ) {}

    public static ClubSummaryQuery from(Club club) {
        return new ClubSummaryQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getCollege(),
                club.getDepartment(),
                club.getLogoUrl(),
                club.getStatus(),
                club.getTags(),
                club.getTagline(),
                club.isCentralClub(),
                null
        );
    }

    public ClubSummaryQuery withActiveRecruitment(ActiveRecruitmentSummary recruitmentSummary) {
        return new ClubSummaryQuery(id, name, category, division, college, department, logoUrl, status, tags, tagline, centralClub, recruitmentSummary);
    }
}
