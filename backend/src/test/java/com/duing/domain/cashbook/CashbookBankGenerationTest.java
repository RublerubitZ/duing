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
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class CashbookBankGenerationTest extends IntegrationTestBase {

    @Autowired ClubRepository clubRepository;
    @Autowired BankTransactionRepository bankTransactionRepository;
    @Autowired CashbookEntryRepository cashbookEntryRepository;

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
                clubId, "KB", LocalDateTime.of(2026, 9, 1, 10, 0), amount, 500000L, counterparty,
                type, type.equals("DEPOSIT") ? "PENDING" : "IGNORED", null, hash, "{}");
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
}
