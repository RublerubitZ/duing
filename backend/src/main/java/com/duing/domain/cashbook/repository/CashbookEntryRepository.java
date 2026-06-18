package com.duing.domain.cashbook.repository;

import com.duing.domain.cashbook.entity.CashbookEntry;
import java.util.Collection;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CashbookEntryRepository extends JpaRepository<CashbookEntry, Long>, CashbookEntryRepositoryCustom {
    Optional<CashbookEntry> findByIdAndClubId(Long id, Long clubId);

    // BANK 거래(입금→INCOME, 출금→EXPENSE)를 장부 항목으로 멱등 생성한다(카테고리=OTHER 미분류).
    // amount > 0 가드로 chk_cashbook_amount(amount > 0) 위반을 막는다.
    // uk_cashbook_bank_tx(부분 유니크) 술어를 ON CONFLICT 에 명시해야 매칭된다. 반환=실제 INSERT 행 수.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO cashbook_entry (club_id, entry_type, source, category_code, custom_category, amount,
                                        description, transaction_date, memo, attachment_url, bank_transaction_id,
                                        created_at, updated_at)
            SELECT bt.club_id,
                   CASE WHEN bt.transaction_type = 'DEPOSIT' THEN 'INCOME' ELSE 'EXPENSE' END,
                   'BANK_API', 'OTHER', NULL, bt.amount,
                   COALESCE(NULLIF(bt.counterparty, ''),
                            CASE WHEN bt.transaction_type = 'DEPOSIT' THEN '입금' ELSE '출금' END),
                   -- transaction_at 은 KST 벽시계가 UTC instant 로 저장됨 → AT TIME ZONE 'UTC' 로 그 KST 날짜를 복원(Asia/Seoul 쓰면 +9h 더 변환돼 저녁 거래 +1일)
                   (bt.transaction_at AT TIME ZONE 'UTC')::date, NULL, NULL, bt.id, now(), now()
            FROM bank_transaction bt
            WHERE bt.transaction_hash IN (:transactionHashes) AND bt.deleted_at IS NULL AND bt.amount > 0
            ON CONFLICT (bank_transaction_id) WHERE bank_transaction_id IS NOT NULL AND deleted_at IS NULL
            DO NOTHING
            """, nativeQuery = true)
    int generateFromBankTransactions(@Param("transactionHashes") Collection<String> transactionHashes);
}
