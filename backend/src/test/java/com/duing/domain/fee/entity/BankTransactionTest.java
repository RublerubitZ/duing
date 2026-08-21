package com.duing.domain.fee.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BankTransactionTest {

    // BANK 거래 시각은 KST 의미라, 그 벽시계를 절대시각으로 굳혀 픽스처로 쓴다.
    private static final Instant TRANSACTION_AT =
            LocalDateTime.of(2026, 6, 15, 10, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant();
    private static final String RAW_PAYLOAD = "{\"tranAmt\":10000}";

    private BankTransaction depositTransaction() {
        return BankTransaction.ingest(1L, "020", TRANSACTION_AT, 10000L, 50000L, "홍길동",
                TransactionType.DEPOSIT, "hash-deposit", RAW_PAYLOAD);
    }

    @Test
    @DisplayName("입금 거래를 적재하면 매칭 대상이므로 PENDING 상태로 생성되고 isDeposit/isPending 이 참이다")
    void ingestDepositStartsAsPending() {
        BankTransaction transaction = depositTransaction();

        assertThat(transaction.getMatchStatus()).isEqualTo(MatchStatus.PENDING);
        assertThat(transaction.isPending()).isTrue();
        assertThat(transaction.isDeposit()).isTrue();
        assertThat(transaction.getAmount()).isEqualTo(10000L);
        assertThat(transaction.getMatchedFeeBillId()).isNull();
    }

    @Test
    @DisplayName("출금 거래를 적재하면 회비 매칭과 무관하므로 IGNORED 상태로 생성된다")
    void ingestWithdrawalStartsAsIgnored() {
        BankTransaction transaction = BankTransaction.ingest(1L, "020", TRANSACTION_AT, 3000L, 47000L,
                "편의점", TransactionType.WITHDRAWAL, "hash-withdrawal", RAW_PAYLOAD);

        assertThat(transaction.getMatchStatus()).isEqualTo(MatchStatus.IGNORED);
        assertThat(transaction.isPending()).isFalse();
        assertThat(transaction.isDeposit()).isFalse();
    }

    @Test
    @DisplayName("거래를 특정 청구건에 매칭하면 matchedFeeBillId 와 매칭 상태가 함께 설정된다")
    void matchToSetsFeeBillIdAndStatus() {
        BankTransaction transaction = depositTransaction();

        transaction.matchTo(42L, MatchStatus.AUTO_MATCHED);

        assertThat(transaction.getMatchedFeeBillId()).isEqualTo(42L);
        assertThat(transaction.getMatchStatus()).isEqualTo(MatchStatus.AUTO_MATCHED);
    }

    @Test
    @DisplayName("매칭을 해제하면 상태가 PENDING 으로 되돌아가고 matchedFeeBillId 가 비워진다")
    void resetToPendingClearsMatch() {
        BankTransaction transaction = depositTransaction();
        transaction.matchTo(42L, MatchStatus.AUTO_MATCHED);

        transaction.resetToPending();

        assertThat(transaction.getMatchStatus()).isEqualTo(MatchStatus.PENDING);
        assertThat(transaction.getMatchedFeeBillId()).isNull();
    }

    @Test
    @DisplayName("거래를 무시하면 상태가 IGNORED 로 전이된다")
    void ignoreTransitionsToIgnored() {
        BankTransaction transaction = depositTransaction();

        transaction.ignore();

        assertThat(transaction.getMatchStatus()).isEqualTo(MatchStatus.IGNORED);
    }
}
