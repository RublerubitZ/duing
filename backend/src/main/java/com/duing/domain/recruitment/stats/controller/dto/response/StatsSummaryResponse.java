package com.duing.domain.recruitment.stats.controller.dto.response;

import com.duing.domain.recruitment.stats.service.dto.query.StatsSummaryQuery;

public record StatsSummaryResponse(
        long total,
        long submitted,
        long underReview,
        long interviewPending,
        long accepted,
        long rejected,
        int capacity,
        double ratio
) {

    public static StatsSummaryResponse from(StatsSummaryQuery statsSummaryQuery) {
        return new StatsSummaryResponse(
                statsSummaryQuery.total(),
                statsSummaryQuery.submitted(),
                statsSummaryQuery.underReview(),
                statsSummaryQuery.interviewPending(),
                statsSummaryQuery.accepted(),
                statsSummaryQuery.rejected(),
                statsSummaryQuery.capacity(),
                statsSummaryQuery.ratio()
        );
    }
}