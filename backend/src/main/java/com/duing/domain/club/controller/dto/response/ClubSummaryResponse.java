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
        /**
         * 최근 7일 순방문자 수 — 홈 "관심도가 높은 동아리" 카드의 표시값.
         * 내부 정렬값(interest_score)은 노출하지 않는다. 집계 전이거나 조회가 없으면 0.
         */
        int weeklyInterestCount,
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
                summaryQuery.weeklyInterestCount(),
                summaryQuery.activeRecruitment() == null
                        ? null
                        : ActiveRecruitmentSummaryResponse.from(summaryQuery.activeRecruitment())
        );
    }
}