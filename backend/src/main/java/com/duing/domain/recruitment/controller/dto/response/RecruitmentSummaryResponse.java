package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import java.time.LocalDate;

public record RecruitmentSummaryResponse(
        Long id,
        Long clubId,
        String clubName,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        boolean effectivelyOpen,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole
) {
    public static RecruitmentSummaryResponse from(RecruitmentSummaryQuery summaryQuery) {
        return new RecruitmentSummaryResponse(
                summaryQuery.id(),
                summaryQuery.clubId(),
                summaryQuery.clubName(),
                summaryQuery.title(),
                summaryQuery.startDate(),
                summaryQuery.endDate(),
                summaryQuery.capacity(),
                summaryQuery.status(),
                summaryQuery.effectivelyOpen(),
                summaryQuery.applicationMode(),
                summaryQuery.externalFormUrl(),
                summaryQuery.useInterview(),
                summaryQuery.targetRole()
        );
    }
}
