package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.repository.MatchCandidate;
import java.time.LocalDate;

/** 검토 큐의 PENDING 입금에 동봉되는 매칭 후보 청구 1건. */
public record MatchCandidateResponse(
        Long feeBillId,
        Long userId,
        String memberName,
        String billingPeriod,
        LocalDate dueDate,
        long remaining
) {
    public static MatchCandidateResponse from(MatchCandidate candidate) {
        return new MatchCandidateResponse(
                candidate.feeBillId(),
                candidate.userId(),
                candidate.memberName(),
                candidate.billingPeriod(),
                candidate.dueDate(),
                candidate.remaining());
    }
}
