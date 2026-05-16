package com.duing.domain.recruitment.stats.service.dto.query;

public record StatsSummaryQuery(
        long total,
        long submitted,
        long underReview,
        long interviewPending,
        long accepted,
        long rejected,
        int capacity,
        double ratio
) {

    public static StatsSummaryQuery of(
            long submitted,
            long underReview,
            long interviewPending,
            long accepted,
            long rejected,
            int capacity
    ) {
        long total = submitted + underReview + interviewPending + accepted + rejected;
        double ratio = capacity == 0 ? 0.0 : (double) accepted / capacity;
        return new StatsSummaryQuery(total, submitted, underReview, interviewPending, accepted, rejected, capacity, ratio);
    }
}