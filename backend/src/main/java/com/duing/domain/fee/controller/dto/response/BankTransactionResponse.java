package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.service.dto.query.BankTransactionView;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.List;

/**
 * 검토 큐 거래 1건. PENDING 입금이면 candidates 에 매칭 후보 청구가 채워진다.
 * matchedMemberName/matchedBillingPeriod 는 이미 매칭된 거래에서만 채워지고(총무가 입금자명과 대조),
 * PENDING/무시 거래에서는 null 이다.
 */
public record BankTransactionResponse(
        Long id,
        Instant transactionAt,
        Long amount,
        String counterparty,
        TransactionType transactionType,
        MatchStatus matchStatus,
        Long matchedFeeBillId,
        List<MatchCandidateResponse> candidates,
        String matchedMemberName,
        String matchedBillingPeriod
) {
    public static BankTransactionResponse from(BankTransactionView view) {
        return new BankTransactionResponse(
                view.id(),
                // transaction_at 은 BANK API 파싱 KST 벽시계(BankApiHttpClient) — seoul 변환.
                TimeMapper.seoulWallClockToInstant(view.transactionAt()),
                view.amount(),
                view.counterparty(),
                view.transactionType(),
                view.matchStatus(),
                view.matchedFeeBillId(),
                view.candidates().stream().map(MatchCandidateResponse::from).toList(),
                view.matchedMemberName(),
                view.matchedBillingPeriod());
    }
}
