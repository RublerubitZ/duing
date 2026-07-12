package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.entity.BankMatchingSetting;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.repository.BankMatchingSettingRepository;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.bank.BankApiClient;
import com.duing.global.bank.dto.AccountSlotStatus;
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.crypto.FeeAccountCipher;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 동기화(BE-4) ↔ 자동매칭(BE-5b) 연결 검증. 적재 직후 매처가 신규 PENDING 입금을 돌며
 * {@code SyncResult.autoMatched}/{@code pendingReview} 를 채우고, 매칭 성공 시 납부·청구 전이·자동확인 알림까지
 * 이어지는지 확인한다. BANK API 는 stub 으로 대체한다.
 */
@Import({TestcontainersConfiguration.class, BankTransactionSyncMatchTest.StubBankApiConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BankTransactionSyncMatchTest extends IntegrationTestBase {

    private static final String ACCOUNT_PASSWORD = "test-pw";
    private static final String RESIDENT_NUMBER = "000000";

    static class StubBankApiClient implements BankApiClient {

        volatile List<BankTransactionData> transactionsToReturn = List.of();
        volatile TransactionLookupCommand capturedLookup;

        void reset() {
            transactionsToReturn = List.of();
            capturedLookup = null;
        }

        @Override
        public void registerAccount(String bankCode, String accountNumber) {
        }

        @Override
        public void deleteAccount(String bankCode, String accountNumber) {
        }

        @Override
        public AccountSlotStatus getAccountStatus() {
            return new AccountSlotStatus(0, 5, 5);
        }

        @Override
        public List<BankTransactionData> getTransactions(TransactionLookupCommand command) {
            this.capturedLookup = command;
            return transactionsToReturn;
        }
    }

    @TestConfiguration
    static class StubBankApiConfig {
        @Bean
        @Primary
        StubBankApiClient stubBankApiClient() {
            return new StubBankApiClient();
        }
    }

    @LocalServerPort
    int port;

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    FeeAccountRepository feeAccountRepository;
    @Autowired
    BankMatchingSettingRepository bankMatchingSettingRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    FeeAccountCipher feeAccountCipher;
    @Autowired
    StubBankApiClient stubBankApiClient;
    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        stubBankApiClient.reset();
    }

    /** NH 회비 계좌 + 자동매칭 사용 가능 설정을 갖춘 동아리를 만들고 저장된 Club 을 반환한다. */
    private Club saveEnabledClub(String clubName) {
        Club club = clubRepository.save(ClubFixture.academic(clubName));
        Long clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 거래 동기화(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
        String encrypted = feeAccountCipher.encrypt("352-1234-5678-90", clubId);
        feeAccountRepository.save(FeeAccount.create(clubId, Bank.NH, encrypted, "동아리회비"));
        BankMatchingSetting setting = BankMatchingSetting.of(clubId);
        setting.activate();
        bankMatchingSettingRepository.save(setting);
        return club;
    }

    private FeePolicy savePolicy(Long clubId) {
        return feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
    }

    private User joinAs(Club club, ClubMemberRole role) {
        User user = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(club, user, role));
        return user;
    }

    private FeeBill saveBill(Long clubId, Long policyId, Long userId, long amount, String period) {
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return feeBillRepository.save(FeeBill.issue(clubId, userId, policyId, amount, period, start, end, end));
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private BankTransactionData deposit(LocalDateTime at, long amount, String counterparty) {
        String rawJson = "{\"type\":\"deposit\",\"amount\":" + amount + "}";
        return new BankTransactionData(at, amount, 100000L, "deposit", counterparty,
                "회비 입금", "대구지점", "메모", rawJson);
    }

    private Response syncAs(String token, Long clubId) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(Map.of("accountPassword", ACCOUNT_PASSWORD, "residentNumber", RESIDENT_NUMBER))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/sync");
    }

    @Test
    @DisplayName("동기화한 입금이 잔액 일치 미납 청구 1건과 만나면 자동매칭되어 autoMatched=1·청구 PAID·TRANSFER 납부·자동확인 알림이 생성된다")
    void syncAutoMatchesSingleCandidate() {
        Club club = saveEnabledClub("자동매칭동아리");
        Long clubId = club.getId();
        FeePolicy policy = savePolicy(clubId);
        User leader = joinAs(club, ClubMemberRole.LEADER);
        User member = joinAs(club, ClubMemberRole.MEMBER);
        FeeBill bill = saveBill(clubId, policy.getId(), member.getId(), 10000L, "2026-07");

        LocalDateTime now = LocalDateTime.now();
        stubBankApiClient.transactionsToReturn = List.of(deposit(now.minusDays(1), 10000L, "홍길동"));

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.fetched", equalTo(1))
                .body("data.newlyStored", equalTo(1))
                .body("data.autoMatched", equalTo(1))
                .body("data.pendingReview", equalTo(0));

        // 청구 PAID
        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus()).isEqualTo(FeeStatus.PAID);

        // 납부: TRANSFER · bank_transaction_id 연결
        String method = jdbcTemplate.queryForObject(
                "SELECT method FROM payment WHERE fee_bill_id = ?", String.class, bill.getId());
        Long linkedTxId = jdbcTemplate.queryForObject(
                "SELECT bank_transaction_id FROM payment WHERE fee_bill_id = ?", Long.class, bill.getId());
        Long depositTxId = jdbcTemplate.queryForObject(
                "SELECT id FROM bank_transaction WHERE club_id = ? AND transaction_type = 'DEPOSIT'",
                Long.class, clubId);
        assertThat(method).isEqualTo(PaymentMethod.TRANSFER.name());
        assertThat(linkedTxId).isEqualTo(depositTxId);

        // 거래는 AUTO_MATCHED 로 전이
        String matchStatus = jdbcTemplate.queryForObject(
                "SELECT match_status FROM bank_transaction WHERE id = ?", String.class, depositTxId);
        assertThat(matchStatus).isEqualTo("AUTO_MATCHED");

        // 자동확인 알림(FEE_PAID_CONFIRMED, "자동으로" 문구)이 회원에게 생성 — AFTER_COMMIT 리스너는 매칭 트랜잭션 커밋 시 동기 발화.
        Long autoConfirmedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification WHERE user_id = ? AND type = 'FEE_PAID_CONFIRMED' AND body LIKE ?",
                Long.class, member.getId(), "%자동으로 확인%");
        assertThat(autoConfirmedCount).isEqualTo(1L);
    }

    @Test
    @DisplayName("동기화한 입금이 잔액보다 작으면(부분 금액) 자동매칭은 부분 납부를 하지 않아 autoMatched=0·검토 대기로 남고 청구는 그대로다")
    void syncDoesNotAutoMatchPartialDeposit() {
        Club club = saveEnabledClub("부분입금동아리");
        Long clubId = club.getId();
        FeePolicy policy = savePolicy(clubId);
        User leader = joinAs(club, ClubMemberRole.LEADER);
        User member = joinAs(club, ClubMemberRole.MEMBER);
        FeeBill bill = saveBill(clubId, policy.getId(), member.getId(), 10000L, "2026-07"); // 잔액 10000

        LocalDateTime now = LocalDateTime.now();
        stubBankApiClient.transactionsToReturn = List.of(deposit(now.minusDays(1), 5000L, "홍길동")); // 부분 입금 5000

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.fetched", equalTo(1))
                .body("data.newlyStored", equalTo(1))
                .body("data.autoMatched", equalTo(0))
                .body("data.pendingReview", equalTo(1));

        // 자동매칭은 정확 일치만 하므로 부분 입금은 PENDING 으로 남고 청구·납부는 변동이 없다.
        String matchStatus = jdbcTemplate.queryForObject(
                "SELECT match_status FROM bank_transaction WHERE club_id = ? AND transaction_type = 'DEPOSIT'",
                String.class, clubId);
        assertThat(matchStatus).isEqualTo("PENDING");
        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus()).isEqualTo(FeeStatus.PENDING);
        Integer paymentCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment p JOIN fee_bill b ON p.fee_bill_id = b.id WHERE b.club_id = ?",
                Integer.class, clubId);
        assertThat(paymentCount).isZero();
    }

    @Test
    @DisplayName("동기화한 입금에 잔액 일치 미납 청구 후보가 2건(비KB)이면 자동매칭하지 않아 autoMatched=0·검토 대기(pendingReview)로 남는다")
    void syncLeavesAmbiguousNonKbDepositPending() {
        Club club = saveEnabledClub("모호동아리"); // NH(비KB)
        Long clubId = club.getId();
        FeePolicy policy = savePolicy(clubId);
        User leader = joinAs(club, ClubMemberRole.LEADER);
        User memberOne = joinAs(club, ClubMemberRole.MEMBER);
        User memberTwo = joinAs(club, ClubMemberRole.MEMBER);
        saveBill(clubId, policy.getId(), memberOne.getId(), 10000L, "2026-07");
        saveBill(clubId, policy.getId(), memberTwo.getId(), 10000L, "2026-08");

        LocalDateTime now = LocalDateTime.now();
        stubBankApiClient.transactionsToReturn = List.of(deposit(now.minusDays(1), 10000L, "홍길동"));

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.fetched", equalTo(1))
                .body("data.newlyStored", equalTo(1))
                .body("data.autoMatched", equalTo(0))
                .body("data.pendingReview", equalTo(1));

        // 입금은 매칭되지 않고 PENDING 으로 남는다.
        String matchStatus = jdbcTemplate.queryForObject(
                "SELECT match_status FROM bank_transaction WHERE club_id = ? AND transaction_type = 'DEPOSIT'",
                String.class, clubId);
        assertThat(matchStatus).isEqualTo("PENDING");
        // 어떤 청구도 납부되지 않았다.
        Integer paymentCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment p JOIN fee_bill b ON p.fee_bill_id = b.id WHERE b.club_id = ?",
                Integer.class, clubId);
        assertThat(paymentCount).isZero();
    }
}
