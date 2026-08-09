package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.user.entity.College;
import java.time.LocalDate;
import java.util.List;

public record ClubSummaryResponse(
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
        ActiveRecruitmentSummaryResponse activeRecruitment
) {
    public record ActiveRecruitmentSummaryResponse(
            Long recruitmentId,
            RecruitmentDisplayStatus displayStatus,
            LocalDate startDate,
            LocalDate endDate
    ) {
        public static ActiveRecruitmentSummaryResponse from(ClubSummaryQuery.ActiveRecruitmentSummary source) {
            return new ActiveRecruitmentSummaryResponse(
                    source.recruitmentId(),
                    source.displayStatus(),
                    source.startDate(),
                    source.endDate()
            );
        }
    }

    public static ClubSummaryResponse from(ClubSummaryQuery summaryQuery) {
        return new ClubSummaryResponse(
                summaryQuery.id(),
                summaryQuery.name(),
                summaryQuery.category(),
                summaryQuery.division(),
                summaryQuery.college(),
                summaryQuery.department(),
                summaryQuery.logoUrl(),
                summaryQuery.status(),
                summaryQuery.tags(),
                summaryQuery.tagline(),
                summaryQuery.centralClub(),
                summaryQuery.activeRecruitment() == null
                        ? null
                        : ActiveRecruitmentSummaryResponse.from(summaryQuery.activeRecruitment())
        );
    }
}