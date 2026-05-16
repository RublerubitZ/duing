package com.duing.domain.recruitment.stats.service.dto.query;

import com.duing.domain.application.entity.ApplicationStatus;
import java.util.Map;

public record StatsFunnelQuery(
        long submitted,
        long documentPassed,
        Long interviewEntered,
        long accepted
) {

    public static StatsFunnelQuery from(Map<ApplicationStatus, Long> applicationStatusCounts, boolean useInterview) {
        long submittedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.SUBMITTED, 0L);
        long underReviewCount = applicationStatusCounts.getOrDefault(ApplicationStatus.UNDER_REVIEW, 0L);
        long interviewPendingCount = applicationStatusCounts.getOrDefault(ApplicationStatus.INTERVIEW_PENDING, 0L);
        long acceptedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.ACCEPTED, 0L);
        long rejectedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.REJECTED, 0L);

        long totalSubmitted = submittedCount + underReviewCount + interviewPendingCount + acceptedCount + rejectedCount;
        long documentPassedCount = totalSubmitted - submittedCount;

        Long interviewParticipants = useInterview
                ? interviewPendingCount + acceptedCount + rejectedCount
                : null;

        return new StatsFunnelQuery(totalSubmitted, documentPassedCount, interviewParticipants, acceptedCount);
    }
}