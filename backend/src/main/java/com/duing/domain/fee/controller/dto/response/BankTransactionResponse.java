package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.service.dto.query.BankTransactionView;
import java.time.LocalDateTime;
import java.util.List;

/** 검토 큐 거래 1건. PENDING 입금이면 candidates 에 매칭 후보 청구가 채워진다. */
public record BankTransactionResponse(
        Long id,
        LocalDateTime transactionAt,
        Long amount,
        String counterparty,
        TransactionType transactionType,
        MatchStatus matchStatus,
        Long matchedFeeBillId,
        List<MatchCandidateResponse> candidates
) {
    public static BankTransactionResponse from(BankTransactionView view) {
        return new BankTransactionResponse(
                view.id(),
                view.transactionAt(),
                view.amount(),
                view.counterparty(),
                view.transactionType(),
                view.matchStatus(),
                view.matchedFeeBillId(),
                view.candidates().stream().map(MatchCandidateResponse::from).toList());
    }
}
