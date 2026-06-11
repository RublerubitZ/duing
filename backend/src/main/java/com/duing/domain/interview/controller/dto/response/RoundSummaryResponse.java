package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.service.dto.query.RoundSummaryQuery;
import java.time.LocalDateTime;

public record RoundSummaryResponse(
        Long roundId,
        String title,
        RoundStatus status,
        LocalDateTime availabilityDeadline,
        String location,
        long totalMemberCount,
        long respondedMemberCount
) {
    public static RoundSummaryResponse from(RoundSummaryQuery summaryQuery) {
        return new RoundSummaryResponse(
                summaryQuery.roundId(), summaryQuery.title(), summaryQuery.status(),
                summaryQuery.availabilityDeadline(), summaryQuery.location(),
                summaryQuery.totalMemberCount(), summaryQuery.respondedMemberCount());
    }
}
