package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record ApplicationSummaryResponse(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        /** 모집 마감 여부 — 지원자 화면이 "심사 중"과 "결과 없이 종료됨"을 구분하는 유일한 근거다. */
        RecruitmentStatus recruitmentStatus,
        Long clubId,
        String clubName,
        ClubCategory category,
        String logoUrl,
        ApplicationStatus status,
        AssignedInterviewResponse interview,
        Instant submittedAt
) {

    public static ApplicationSummaryResponse from(ApplicationSummaryQuery summaryQuery) {
        AssignedInterviewResponse interview = AssignedInterviewResponse.from(summaryQuery.interview());
        return new ApplicationSummaryResponse(
                summaryQuery.id(),
                summaryQuery.recruitmentId(),
                summaryQuery.recruitmentTitle(),
                summaryQuery.recruitmentStatus(),
                summaryQuery.clubId(),
                summaryQuery.clubName(),
                summaryQuery.category(),
                summaryQuery.logoUrl(),
                summaryQuery.status().asApplicantVisible(),
                interview,
                TimeMapper.systemWallClockToInstant(summaryQuery.submittedAt())
        );
    }
}
