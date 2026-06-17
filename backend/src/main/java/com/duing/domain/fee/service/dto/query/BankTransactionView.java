package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.repository.MatchCandidate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 검토 큐 1건. 거래 자체의 표시 필드와, PENDING 입금일 때만 채워지는 매칭 후보 청구 목록을 담는다.
 * 비-PENDING(이미 매칭·무시된) 거래는 후보가 비어 있다.
 */
public record BankTransactionView(
        Long id,
        LocalDateTime transactionAt,
        Long amount,
        String counterparty,
        TransactionType transactionType,
        MatchStatus matchStatus,
        Long matchedFeeBillId,
        List<MatchCandidate> candidates
) {
    public static BankTransactionView from(BankTransaction transaction, List<MatchCandidate> candidates) {
        return new BankTransactionView(
                transaction.getId(),
                transaction.getTransactionAt(),
                transaction.getAmount(),
                transaction.getCounterparty(),
                transaction.getTransactionType(),
                transaction.getMatchStatus(),
                transaction.getMatchedFeeBillId(),
                candidates);
    }
}
