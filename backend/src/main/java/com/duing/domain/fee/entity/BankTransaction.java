package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

@Getter
@Entity
@Table(name = "bank_transaction")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE bank_transaction SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class BankTransaction extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(name = "bank_code", nullable = false, length = 10)
    private String bankCode;

    @Column(name = "transaction_at", nullable = false)
    private LocalDateTime transactionAt;

    @Column(nullable = false)
    private Long amount;

    @Column
    private Long balance;

    @Column(length = 100)
    private String counterparty;

    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", nullable = false, length = 20)
    private TransactionType transactionType;

    @Enumerated(EnumType.STRING)
    @Column(name = "match_status", nullable = false, length = 20)
    private MatchStatus matchStatus;

    @Column(name = "matched_fee_bill_id")
    private Long matchedFeeBillId;

    @Column(name = "transaction_hash", nullable = false, length = 64, unique = true)
    private String transactionHash;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_payload", nullable = false, columnDefinition = "jsonb")
    private String rawPayload;

    @Builder(access = AccessLevel.PRIVATE)
    private BankTransaction(Long clubId, String bankCode, LocalDateTime transactionAt, Long amount,
                            Long balance, String counterparty, TransactionType transactionType,
                            MatchStatus matchStatus, String transactionHash, String rawPayload) {
        this.clubId = clubId;
        this.bankCode = bankCode;
        this.transactionAt = transactionAt;
        this.amount = amount;
        this.balance = balance;
        this.counterparty = counterparty;
        this.transactionType = transactionType;
        this.matchStatus = matchStatus;
        this.transactionHash = transactionHash;
        this.rawPayload = rawPayload;
    }

    /**
     * BANK API 로 수집한 거래 1건을 적재한다. 입금(DEPOSIT)은 매칭 대상이므로 PENDING 으로,
     * 출금(WITHDRAWAL)은 회비 매칭과 무관하므로 IGNORED 로 초기화한다.
     */
    public static BankTransaction ingest(Long clubId, String bankCode, LocalDateTime transactionAt,
                                         Long amount, Long balance, String counterparty,
                                         TransactionType transactionType, String transactionHash,
                                         String rawPayload) {
        MatchStatus initialStatus =
                transactionType == TransactionType.DEPOSIT ? MatchStatus.PENDING : MatchStatus.IGNORED;
        return BankTransaction.builder()
                .clubId(clubId)
                .bankCode(bankCode)
                .transactionAt(transactionAt)
                .amount(amount)
                .balance(balance)
                .counterparty(counterparty)
                .transactionType(transactionType)
                .matchStatus(initialStatus)
                .transactionHash(transactionHash)
                .rawPayload(rawPayload)
                .build();
    }

    /** 거래를 특정 청구건에 매칭한다(자동/수동 모두). */
    public void matchTo(Long feeBillId, MatchStatus matchStatus) {
        this.matchedFeeBillId = feeBillId;
        this.matchStatus = matchStatus;
    }

    /** 회비와 무관한 거래로 표시한다. */
    public void ignore() {
        this.matchStatus = MatchStatus.IGNORED;
    }

    /** 매칭을 해제하고 다시 매칭 대기 상태로 되돌린다. */
    public void resetToPending() {
        this.matchStatus = MatchStatus.PENDING;
        this.matchedFeeBillId = null;
    }

    public boolean isPending() {
        return matchStatus == MatchStatus.PENDING;
    }

    public boolean isDeposit() {
        return transactionType == TransactionType.DEPOSIT;
    }
}
