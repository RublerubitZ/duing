package com.duing.domain.club.service.dto.query;

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
        /** 최근 7일 순방문자 수 — 홈 관심도 카드의 표시값. 집계 전이거나 조회가 없으면 0. */
        int weeklyInterestCount,
        ActiveRecruitmentSummary activeRecruitment
) {
    public record ActiveRecruitmentSummary(
            Long recruitmentId,
            RecruitmentDisplayStatus displayStatus,
            LocalDate startDate,
            LocalDate endDate
    ) {}

    public ClubSummaryQuery withActiveRecruitment(ActiveRecruitmentSummary recruitmentSummary) {
        return new ClubSummaryQuery(id, name, category, division, college, department, logoUrl, status,
                tags, tagline, centralClub, weeklyInterestCount, recruitmentSummary);
    }
}
