package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import java.time.LocalDateTime;

public record ApplicationSummaryResponse(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt
) {
    public static ApplicationSummaryResponse from(ApplicationSummaryQuery summaryQuery) {
        return new ApplicationSummaryResponse(
                summaryQuery.id(),
                summaryQuery.recruitmentId(),
                summaryQuery.recruitmentTitle(),
                summaryQuery.clubId(),
                summaryQuery.clubName(),
                summaryQuery.status(),
                summaryQuery.interviewAt(),
                summaryQuery.interviewLocation(),
                summaryQuery.submittedAt()
        );
    }
}
