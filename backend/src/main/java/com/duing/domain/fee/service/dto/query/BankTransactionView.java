package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.repository.MatchCandidate;
import java.time.Instant;
import java.util.List;

/**
 * 검토 큐 1건. 거래 자체의 표시 필드와, PENDING 입금일 때만 채워지는 매칭 후보 청구 목록을 담는다.
 * 비-PENDING(이미 매칭·무시된) 거래는 후보가 비어 있다.
 * matchedMemberName/matchedBillingPeriod 는 이미 매칭된 거래에서만 채워지며(총무가 입금자명과 대조해
 * 오매칭을 잡도록), PENDING/무시 거래에서는 null 이다. 탈퇴 회원이면 이름이 null 일 수 있다.
 */
public record BankTransactionView(
        Long id,
        Instant transactionAt,
        Long amount,
        String counterparty,
        TransactionType transactionType,
        MatchStatus matchStatus,
        Long matchedFeeBillId,
        List<MatchCandidate> candidates,
        String matchedMemberName,
        String matchedBillingPeriod
) {
    /** PENDING 입금: 매칭 후보를 동봉하고 매칭 정보는 비운다. */
    public static BankTransactionView pending(BankTransaction transaction, List<MatchCandidate> candidates) {
        return from(transaction, candidates, null, null);
    }

    /** 이미 매칭된 거래: 후보 없이 매칭 회원 이름·회차를 채운다(둘 다 null 가능). */
    public static BankTransactionView matched(
            BankTransaction transaction, String matchedMemberName, String matchedBillingPeriod) {
        return from(transaction, List.of(), matchedMemberName, matchedBillingPeriod);
    }

    private static BankTransactionView from(
            BankTransaction transaction, List<MatchCandidate> candidates,
            String matchedMemberName, String matchedBillingPeriod) {
        return new BankTransactionView(
                transaction.getId(),
                transaction.getTransactionAt(),
                transaction.getAmount(),
                transaction.getCounterparty(),
                transaction.getTransactionType(),
                transaction.getMatchStatus(),
                transaction.getMatchedFeeBillId(),
                candidates,
                matchedMemberName,
                matchedBillingPeriod);
    }
}
