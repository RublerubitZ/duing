package com.duing.domain.cashbook;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.domain.cashbook.entity.CashbookEntry;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import com.duing.domain.cashbook.entity.CashbookSource;
import com.duing.domain.cashbook.repository.CashbookEntryRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.repository.BankTransactionRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class CashbookBankGenerationTest extends IntegrationTestBase {

    @Autowired ClubRepository clubRepository;
    @Autowired BankTransactionRepository bankTransactionRepository;
    @Autowired CashbookEntryRepository cashbookEntryRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    // @Modifying native insert/generate 는 활성 트랜잭션을 요구한다(TransactionRequiredException).
    // 운영 경로(persist)와 동일하게 적재+장부 생성을 하나의 트랜잭션 경계 안에서 실행한다.
    @Autowired TransactionTemplate transactionTemplate;

    private Long clubId;

    @BeforeEach
    void setUp() {
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
    }

    // bank_transaction 1건을 native insert 로 적재한다(insertIgnoringConflict: 신규=1).
    private void insertBankTx(String hash, String type, long amount, String counterparty) {
        bankTransactionRepository.insertIgnoringConflict(
                clubId, "KB", LocalDateTime.of(2026, 9, 1, 10, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant(),
                amount, 500000L, counterparty,
                type, type.equals("DEPOSIT") ? "PENDING" : "IGNORED", null, hash, "{}");
    }

    // transaction_at 을 명시적 UTC instant 문자열로 적재한다(거래일 추출 규약 검증용).
    // 저장 절대시각을 직접 지정해야 호스트 TZ 와 무관하게 회귀 단정이 결정적이 된다.
    private void insertBankTxAtInstant(String hash, String type, long amount, String counterparty,
                                       String transactionAtUtc) {
        jdbcTemplate.update("""
                INSERT INTO bank_transaction
                    (club_id, bank_code, transaction_at, amount, balance, counterparty,
                     transaction_type, match_status, matched_fee_bill_id, transaction_hash,
                     raw_payload, created_at, updated_at)
                VALUES (?, 'KB', ?::timestamptz, ?, 500000, ?, ?, ?, NULL, ?, '{}'::jsonb, now(), now())
                """,
                clubId, transactionAtUtc, amount, counterparty,
                type, type.equals("DEPOSIT") ? "PENDING" : "IGNORED", hash);
    }

    @Test
    @DisplayName("입금은 INCOME, 출금은 EXPENSE 장부 항목으로 BANK_API 생성된다")
    void generatesIncomeAndExpense() {
        transactionTemplate.executeWithoutResult(status -> {
            insertBankTx("h-dep", "DEPOSIT", 100000L, "홍길동");
            insertBankTx("h-wd", "WITHDRAWAL", 30000L, null);

            cashbookEntryRepository.generateFromBankTransactions(List.of("h-dep", "h-wd"));
        });

        List<CashbookEntry> entries = cashbookEntryRepository.findAll();
        assertThat(entries).hasSize(2);
        assertThat(entries).allMatch(entry -> entry.getSource() == CashbookSource.BANK_API);
        assertThat(entries).anyMatch(entry ->
                entry.getEntryType() == CashbookEntryType.INCOME && entry.getAmount() == 100000L
                        && "홍길동".equals(entry.getDescription()));
        assertThat(entries).anyMatch(entry ->
                entry.getEntryType() == CashbookEntryType.EXPENSE && entry.getAmount() == 30000L
                        && "출금".equals(entry.getDescription()));
    }

    @Test
    @DisplayName("같은 거래로 두 번 생성해도 장부 항목이 중복되지 않는다(멱등)")
    void idempotent() {
        transactionTemplate.executeWithoutResult(status -> {
            insertBankTx("h-dep", "DEPOSIT", 100000L, "홍길동");

            cashbookEntryRepository.generateFromBankTransactions(List.of("h-dep"));
            cashbookEntryRepository.generateFromBankTransactions(List.of("h-dep"));
        });

        assertThat(cashbookEntryRepository.findAll()).hasSize(1);
    }

    @Test
    @DisplayName("새벽 01시 KST 거래는 그 KST 날짜로 장부에 기록된다(전날로 어긋나지 않는다)")
    void earlyMorningTransactionKeepsKstDate() {
        // transaction_at 이 정합 절대시각이 된 뒤로는 KST 자정~09시 구간이 UTC 로는 전날이다.
        // KST 9/2 01:00 = UTC 9/1 16:00 이라, AT TIME ZONE 'Asia/Seoul' 로 뽑아야 거래일이 9/2 가 된다 —
        // 'UTC' 로 되돌리면 9/1 로 하루 밀리므로 이 단정이 그 회귀를 잡는다.
        transactionTemplate.executeWithoutResult(status -> {
            insertBankTxAtInstant("h-early", "DEPOSIT", 50000L, "새벽입금", "2026-09-01 16:00:00+00");

            cashbookEntryRepository.generateFromBankTransactions(List.of("h-early"));
        });

        List<CashbookEntry> entries = cashbookEntryRepository.findAll();
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0).getTransactionDate()).isEqualTo(LocalDate.of(2026, 9, 2));
    }

    @Test
    @DisplayName("amount=0 거래는 장부 항목으로 생성되지 않는다(amount>0 가드)")
    void excludesZeroAmount() {
        transactionTemplate.executeWithoutResult(status -> {
            insertBankTx("h-zero", "DEPOSIT", 0L, "영원입금");

            cashbookEntryRepository.generateFromBankTransactions(List.of("h-zero"));
        });

        assertThat(cashbookEntryRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("소프트삭제된 BANK 거래는 장부 항목으로 생성되지 않는다(deleted_at IS NULL 가드)")
    void excludesSoftDeleted() {
        transactionTemplate.executeWithoutResult(status -> {
            insertBankTx("h-deleted", "DEPOSIT", 70000L, "삭제대상");
            jdbcTemplate.update("UPDATE bank_transaction SET deleted_at = now() WHERE transaction_hash = ?", "h-deleted");

            cashbookEntryRepository.generateFromBankTransactions(List.of("h-deleted"));
        });

        assertThat(cashbookEntryRepository.findAll()).isEmpty();
    }
}
