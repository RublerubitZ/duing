package com.duing.domain.recruitment.stats.service.dto.query;

import com.duing.domain.recruitment.service.dto.query.AutoCloseOutlookQuery;
import java.time.LocalDateTime;

public record StatsSummaryQuery(
        long total,
        long submitted,
        long onHold,
        long interviewPending,
        long accepted,
        long rejected,
        int capacity,
        double ratio,
        LocalDateTime oldestPendingSubmittedAt,
        boolean deletable,
        AutoCloseOutlookQuery autoClose
) {

    public static StatsSummaryQuery of(
            long submitted,
            long onHold,
            long interviewPending,
            long accepted,
            long rejected,
            int capacity,
            LocalDateTime oldestPendingSubmittedAt,
            boolean deletable,
            AutoCloseOutlookQuery autoClose
    ) {
        long total = submitted + onHold + interviewPending + accepted + rejected;
        double ratio = capacity == 0 ? 0.0 : (double) accepted / capacity;
        return new StatsSummaryQuery(total, submitted, onHold, interviewPending, accepted, rejected, capacity, ratio,
                oldestPendingSubmittedAt, deletable, autoClose);
    }
}
