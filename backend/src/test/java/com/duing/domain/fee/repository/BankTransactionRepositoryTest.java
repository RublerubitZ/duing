package com.duing.domain.fee.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.BankTransaction;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
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
class BankTransactionRepositoryTest extends IntegrationTestBase {

    // 거래 시각은 KST 의미라, 벽시계를 절대시각으로 굳혀 적재한다.
    private static final Instant TRANSACTION_AT =
            LocalDateTime.of(2026, 6, 15, 10, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant();

    @Autowired
    private BankTransactionRepository bankTransactionRepository;

    @Autowired
    private ClubRepository clubRepository;

    // @Modifying native insert 는 활성 트랜잭션을 요구하므로(TransactionRequiredException)
    // 적재+조회를 하나의 트랜잭션 경계 안에서 실행한다.
    @Autowired
    private TransactionTemplate transactionTemplate;

    private Long clubId;

    @BeforeEach
    void setUp() {
        // club_id FK 충족을 위해 실제 club 행 1건을 적재한다.
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
    }

    @Test
    @DisplayName("balance·counterparty 가 null 이어도 native INSERT 가 nullable 파라미터를 정상 바인딩해 적재되고 다시 조회된다")
    void insertIgnoringConflictBindsNullableParams() {
        transactionTemplate.executeWithoutResult(status -> {
            int inserted = bankTransactionRepository.insertIgnoringConflict(
                    clubId, "NH", TRANSACTION_AT, 10000L, null, null,
                    "DEPOSIT", "PENDING", null, "hash-aaa", "{}");

            assertThat(inserted).isEqualTo(1);

            List<BankTransaction> found =
                    bankTransactionRepository.findByTransactionHashIn(List.of("hash-aaa"));
            assertThat(found).hasSize(1);
            BankTransaction transaction = found.get(0);
            assertThat(transaction.getTransactionHash()).isEqualTo("hash-aaa");
            assertThat(transaction.getAmount()).isEqualTo(10000L);
            assertThat(transaction.getBalance()).isNull();
            assertThat(transaction.getCounterparty()).isNull();
        });
    }

    @Test
    @DisplayName("같은 transaction_hash 로 두 번째 적재하면 충돌이 무시되어 0 을 반환하고 중복 행이 생기지 않는다")
    void insertIgnoringConflictIsIdempotentOnSameHash() {
        transactionTemplate.executeWithoutResult(status -> {
            int first = bankTransactionRepository.insertIgnoringConflict(
                    clubId, "NH", TRANSACTION_AT, 10000L, 50000L, "홍길동",
                    "DEPOSIT", "PENDING", null, "hash-aaa", "{}");
            assertThat(first).isEqualTo(1);

            int second = bankTransactionRepository.insertIgnoringConflict(
                    clubId, "NH", TRANSACTION_AT.plusSeconds(3600), 20000L, 70000L, "김두잉",
                    "DEPOSIT", "PENDING", null, "hash-aaa", "{}");

            assertThat(second).isEqualTo(0);
            assertThat(bankTransactionRepository.findByTransactionHashIn(List.of("hash-aaa")))
                    .hasSize(1);
        });
    }

    @Test
    @DisplayName("다른 transaction_hash 는 별도 행으로 적재되어 기존 거래와 공존한다")
    void insertIgnoringConflictInsertsDistinctHashSeparately() {
        transactionTemplate.executeWithoutResult(status -> {
            bankTransactionRepository.insertIgnoringConflict(
                    clubId, "NH", TRANSACTION_AT, 10000L, 50000L, "홍길동",
                    "DEPOSIT", "PENDING", null, "hash-aaa", "{}");

            int inserted = bankTransactionRepository.insertIgnoringConflict(
                    clubId, "NH", TRANSACTION_AT, 30000L, 80000L, "이두잉",
                    "DEPOSIT", "PENDING", null, "hash-bbb", "{}");

            assertThat(inserted).isEqualTo(1);
            assertThat(bankTransactionRepository.findByTransactionHashIn(List.of("hash-aaa", "hash-bbb")))
                    .hasSize(2);
        });
    }
}
