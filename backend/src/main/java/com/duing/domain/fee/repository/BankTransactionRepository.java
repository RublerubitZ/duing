package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.TransactionType;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BankTransactionRepository extends JpaRepository<BankTransaction, Long> {

    Optional<BankTransaction> findByIdAndClubId(Long id, Long clubId);

    // 매칭 납부 생성이 같은 거래 행에 대해 직렬화되도록 비관적 쓰기 잠금으로 조회한다.
    // 서로 다른 청구로의 동시 매칭이라도 같은 거래 행 잠금에서 경합해 한 입금의 이중 소비를 막는다(동아리로 격리).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM BankTransaction t WHERE t.id = :id AND t.clubId = :clubId")
    Optional<BankTransaction> findByIdAndClubIdForUpdate(@Param("id") Long id, @Param("clubId") Long clubId);

    Page<BankTransaction> findByClubIdAndMatchStatusOrderByTransactionAtDesc(Long clubId, MatchStatus matchStatus, Pageable pageable);

    List<BankTransaction> findByTransactionHashIn(List<String> transactionHashes);

    @Query("SELECT MAX(bt.transactionAt) FROM BankTransaction bt WHERE bt.clubId = :clubId")
    Optional<LocalDateTime> findLatestTransactionAt(@Param("clubId") Long clubId);

    /**
     * BANK API 수집분을 멱등 적재한다. transaction_hash 유니크 충돌 시 DO NOTHING 으로 무시한다.
     * jsonb 컬럼은 바인딩 파라미터를 명시적으로 캐스팅해야 하므로 native 쿼리로 작성한다.
     * 반환값은 실제 INSERT 된 행 수(0 또는 1)이다.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO bank_transaction
                (club_id, bank_code, transaction_at, amount, balance, counterparty,
                 transaction_type, match_status, matched_fee_bill_id, transaction_hash,
                 raw_payload, created_at, updated_at)
            VALUES
                (:clubId, :bankCode, :transactionAt, :amount, :balance, :counterparty,
                 :transactionType, :matchStatus, :matchedFeeBillId, :transactionHash,
                 CAST(:rawPayload AS jsonb), now(), now())
            ON CONFLICT (transaction_hash) DO NOTHING
            """, nativeQuery = true)
    int insertIgnoringConflict(@Param("clubId") Long clubId,
                               @Param("bankCode") String bankCode,
                               @Param("transactionAt") LocalDateTime transactionAt,
                               @Param("amount") Long amount,
                               @Param("balance") Long balance,
                               @Param("counterparty") String counterparty,
                               @Param("transactionType") String transactionType,
                               @Param("matchStatus") String matchStatus,
                               @Param("matchedFeeBillId") Long matchedFeeBillId,
                               @Param("transactionHash") String transactionHash,
                               @Param("rawPayload") String rawPayload);
}
