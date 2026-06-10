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
     * ASSIGNED schedule 이 있으면 채워지고, 미배정/CANCELLED 만 있으면 응답에서 {@code null}.
     * <p>
     * {@code location} 은 nullable — {@link com.duing.domain.interview.entity.InterviewConfig} 의 location
     * 이 비어 있는 모집은 interview 객체는 노출하되 location 만 {@code null} 로 채운다 (Codex review BE-3).
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
