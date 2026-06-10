package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.club.entity.ClubCategory;
import java.time.LocalDateTime;

public record ApplicationSummaryResponse(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ClubCategory category,
        String logoUrl,
        ApplicationStatus status,
        AssignedInterview interview,
        LocalDateTime submittedAt
) {

    /**
     * 내 지원 목록 카드에서 노출하는 현재 배정 면접 일정/장소.
     * ASSIGNED schedule + InterviewConfig.location 이 모두 존재할 때만 채워지고, 그 외엔 응답에서 {@code null}.
     */
    public record AssignedInterview(
            LocalDateTime startAt,
            LocalDateTime endAt,
            String location
    ) {}

    public static ApplicationSummaryResponse from(ApplicationSummaryQuery summaryQuery) {
        AssignedInterview interview = summaryQuery.interview() == null ? null
                : new AssignedInterview(
                        summaryQuery.interview().startAt(),
                        summaryQuery.interview().endAt(),
                        summaryQuery.interview().location());
        return new ApplicationSummaryResponse(
                summaryQuery.id(),
                summaryQuery.recruitmentId(),
                summaryQuery.recruitmentTitle(),
                summaryQuery.clubId(),
                summaryQuery.clubName(),
                summaryQuery.category(),
                summaryQuery.logoUrl(),
                summaryQuery.status(),
                interview,
                summaryQuery.submittedAt()
        );
    }
}
