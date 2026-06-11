package com.duing.domain.interview.service.dto.query;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import java.time.LocalDateTime;
import java.util.Map;

public record RoundSummaryQuery(
        Long roundId,
        String title,
        RoundStatus status,
        LocalDateTime availabilityDeadline,
        String location,
        long totalMemberCount,
        long respondedMemberCount
) {
    /**
     * totalMemberCount = 비EXCLUDED(응답 가능 대상 N),
     * respondedMemberCount = RESPONDED + NO_AVAILABLE_SLOT + ASSIGNED(응답 행위 완료 n) — §10.5 "응답 대기 n/N".
     */
    public static RoundSummaryQuery of(InterviewRound round, Map<RoundMemberStatus, Long> statusCounts) {
        long excluded = statusCounts.getOrDefault(RoundMemberStatus.EXCLUDED, 0L);
        long total = statusCounts.values().stream().mapToLong(Long::longValue).sum() - excluded;
        long responded = statusCounts.getOrDefault(RoundMemberStatus.RESPONDED, 0L)
                + statusCounts.getOrDefault(RoundMemberStatus.NO_AVAILABLE_SLOT, 0L)
                + statusCounts.getOrDefault(RoundMemberStatus.ASSIGNED, 0L);
        return new RoundSummaryQuery(round.getId(), round.getTitle(), round.getStatus(),
                round.getAvailabilityDeadline(), round.getLocation(), total, responded);
    }
}
