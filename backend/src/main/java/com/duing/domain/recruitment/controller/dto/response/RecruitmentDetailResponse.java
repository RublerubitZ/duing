package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record RecruitmentDetailResponse(
        Long id,
        Long clubId,
        String clubName,
        String title,
        String content,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        List<String> questions,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        boolean showApplicantCount,
        Integer applicantCount,
        LocalDateTime interviewAvailabilityDeadline
) {
    public static RecruitmentDetailResponse from(RecruitmentDetailQuery detailQuery) {
        return new RecruitmentDetailResponse(
                detailQuery.id(),
                detailQuery.clubId(),
                detailQuery.clubName(),
                detailQuery.title(),
                detailQuery.content(),
                detailQuery.startDate(),
                detailQuery.endDate(),
                detailQuery.capacity(),
                detailQuery.status(),
                detailQuery.displayStatus(),
                detailQuery.effectivelyOpen(),
                detailQuery.questions(),
                detailQuery.applicationMode(),
                detailQuery.externalFormUrl(),
                detailQuery.useInterview(),
                detailQuery.targetRole(),
                detailQuery.interviewStartDate(),
                detailQuery.interviewEndDate(),
                detailQuery.showApplicantCount(),
                detailQuery.applicantCount(),
                detailQuery.interviewAvailabilityDeadline()
        );
    }
}
