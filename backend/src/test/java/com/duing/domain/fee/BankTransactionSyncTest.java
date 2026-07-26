package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.entity.BankMatchingSetting;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.repository.BankMatchingSettingRepository;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.bank.BankApiClient;
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.crypto.FeeAccountCipher;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
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

@Import({TestcontainersConfiguration.class, BankTransactionSyncTest.StubBankApiConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BankTransactionSyncTest extends IntegrationTestBase {

    // 동기화 호출에 쓰는 민감 인증정보 — 적재·응답·로그·예외 어디에도 나타나면 안 된다(보안 회귀 단언 기준값).
    private static final String ACCOUNT_PASSWORD = "secretPw1234";
    private static final String RESIDENT_NUMBER = "900101";

    /**
     * 외부 BANK API 를 대체하는 stub. 반환할 거래 목록을 테스트가 주입할 수 있고,
     * {@link #getTransactions(TransactionLookupCommand)} 가 받은 입력(인증정보 포함)을 캡처해
     * "인증정보가 BANK API 에는 전달되지만 적재/응답에는 새지 않는다" 를 검증할 수 있게 한다.
     */
    static class StubBankApiClient implements BankApiClient {

        volatile List<BankTransactionData> transactionsToReturn = List.of();
        // 거래 조회가 받은 입력을 그대로 캡처한다 — 인증정보가 API 로 넘어갔는지 단언용.
        volatile TransactionLookupCommand capturedLookup;

        void reset() {
            transactionsToReturn = List.of();
            capturedLookup = null;
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

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    /** 적격 은행 회비 계좌 + 자동매칭 사용 가능(active && api_registered) 설정을 갖춘 동아리를 만들고 저장된 Club 을 반환한다. */
    private Club saveEnabledClub(String clubName) {
        Club club = clubRepository.save(ClubFixture.academic(clubName));
        Long clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 거래 동기화(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
        String encrypted = feeAccountCipher.encrypt("352-1234-5678-90", clubId);
        feeAccountRepository.save(FeeAccount.create(clubId, Bank.NH, encrypted, "동아리회비"));
        BankMatchingSetting setting = BankMatchingSetting.of(clubId);
        setting.activate(); // active=true, api_registered=true → isUsable()
        bankMatchingSettingRepository.save(setting);
        return club;
    }

    /** 회비 계좌만 있고 자동매칭 설정이 없는(미등록) 동아리를 만들고 저장된 Club 을 반환한다. */
    private Club saveNotEnabledClub(String clubName) {
        Club club = clubRepository.save(ClubFixture.academic(clubName));
        Long clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 거래 동기화(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
        String encrypted = feeAccountCipher.encrypt("352-9999-8888-77", clubId);
        feeAccountRepository.save(FeeAccount.create(clubId, Bank.NH, encrypted, "동아리회비"));
        return club;
    }

    private User joinAs(Club club, ClubMemberRole role) {
        User user = saveUser();
        clubMemberRepository.save(ClubMember.of(club, user, role));
        return user;
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private BankTransactionData deposit(LocalDateTime at, long amount, String counterparty) {
        String rawJson = "{\"type\":\"deposit\",\"amount\":" + amount + ",\"counterparty\":\"" + counterparty + "\"}";
        return new BankTransactionData(at, amount, 100000L, "deposit", counterparty,
                "회비 입금", "대구지점", "메모", rawJson);
    }

    private BankTransactionData withdrawal(LocalDateTime at, long amount, String counterparty) {
        String rawJson = "{\"type\":\"withdrawal\",\"amount\":" + amount + ",\"counterparty\":\"" + counterparty + "\"}";
        return new BankTransactionData(at, amount, 50000L, "withdrawal", counterparty,
                "운영비 지출", "대구지점", "메모", rawJson);
    }

    private Response syncAs(String token, Long clubId) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(Map.of("accountPassword", ACCOUNT_PASSWORD, "residentNumber", RESIDENT_NUMBER))
                .when().post("/api/v1/leader/clubs/" + clubId + "/bank-transactions/sync");
    }

    @Test
    @DisplayName("동기화 시 입금은 PENDING, 출금은 IGNORED 로 적재된다")
    void depositPendingWithdrawalIgnored() {
        Club club = saveEnabledClub("적재동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        LocalDateTime now = LocalDateTime.now();
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(now.minusDays(1), 30000L, "홍길동"),
                withdrawal(now.minusDays(1), 10000L, "임대료"));

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.fetched", equalTo(2))
                .body("data.newlyStored", equalTo(2))
                .body("data.autoMatched", equalTo(0))
                .body("data.pendingReview", equalTo(1));

        String depositStatus = jdbcTemplate.queryForObject(
                "SELECT match_status FROM bank_transaction WHERE club_id = ? AND transaction_type = 'DEPOSIT'",
                String.class, clubId);
        String withdrawalStatus = jdbcTemplate.queryForObject(
                "SELECT match_status FROM bank_transaction WHERE club_id = ? AND transaction_type = 'WITHDRAWAL'",
                String.class, clubId);
        assertThat(depositStatus).isEqualTo("PENDING");
        assertThat(withdrawalStatus).isEqualTo("IGNORED");
    }

    @Test
    @DisplayName("같은 거래(동일 해시)를 두 번 동기화해도 중복 적재 0건이다(newlyStored=0 on 2nd)")
    void idempotentSecondSyncStoresNothing() {
        Club club = saveEnabledClub("멱등동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        LocalDateTime now = LocalDateTime.now();
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(now.minusDays(2), 30000L, "홍길동"),
                deposit(now.minusDays(2), 50000L, "김철수"));

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.newlyStored", equalTo(2));

        // 같은 거래를 다시 동기화 — 멱등 충돌로 신규 적재 0건.
        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.fetched", equalTo(2))
                .body("data.newlyStored", equalTo(0))
                .body("data.pendingReview", equalTo(0));

        Integer rowCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_transaction WHERE club_id = ?", Integer.class, clubId);
        assertThat(rowCount).isEqualTo(2);
    }

    @Test
    @DisplayName("자동매칭 미등록 동아리는 거래 동기화를 요청하면 거부된다")
    void notEnabledClubForbidden() {
        Club club = saveNotEnabledClub("미등록동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        // 사용 불가 동아리는 BANK API 거래 조회에 도달하지 않는다.
        assertThat(stubBankApiClient.capturedLookup).isNull();
    }

    @Test
    @DisplayName("저장된 회비 계좌를 복호화할 수 없으면 동기화가 422 로 닫히고 BANK API 조회에 도달하지 않는다")
    void undecryptableAccountReturnsUnprocessable() {
        // 적격 은행 + 사용 가능 설정을 갖췄지만, 계좌 암호문이 다른 clubId 의 AAD 로 만들어져 복호화가 실패하는 상태.
        Club club = clubRepository.save(ClubFixture.academic("복호화실패동아리"));
        Long clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 거래 동기화(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
        String plaintextAccount = "352-1234-5678-90";
        // FeeAccountCipher 는 clubId 를 AES-GCM 의 AAD 로 바인딩한다 — 다른 clubId 로 암호화하면 복호화 시
        // GCM 태그 인증이 실패(IllegalStateException)해 실제 "복호화 불가" 상태를 재현한다.
        String mismatchedCiphertext = feeAccountCipher.encrypt(plaintextAccount, clubId + 1000L);
        feeAccountRepository.save(FeeAccount.create(clubId, Bank.NH, mismatchedCiphertext, "동아리회비"));
        BankMatchingSetting setting = BankMatchingSetting.of(clubId);
        setting.activate();
        bankMatchingSettingRepository.save(setting);
        User leader = joinAs(club, ClubMemberRole.LEADER);

        String errorBody = syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.UNPROCESSABLE_ENTITY.value())
                .extract().asString();

        // 복호화 실패는 BANK API 조회 전에 차단된다.
        assertThat(stubBankApiClient.capturedLookup).isNull();
        // 고정된 도메인 메시지만 반환된다 — 스택·cause 가 응답으로 새지 않는다.
        assertThat(errorBody).contains("회비 계좌 복호화에 실패했습니다");
        // 평문 계좌번호도, 인증정보(계좌 비번·주민번호)도 응답에 새지 않는다.
        assertThat(errorBody).doesNotContain(plaintextAccount);
        assertThat(errorBody).doesNotContain(ACCOUNT_PASSWORD);
        assertThat(errorBody).doesNotContain(RESIDENT_NUMBER);
    }

    @Test
    @DisplayName("운영진이 아닌 일반 회원은 거래 동기화를 요청할 수 없다")
    void nonManagerForbidden() {
        Club club = saveEnabledClub("권한동아리");
        Long clubId = club.getId();
        User member = joinAs(club, ClubMemberRole.MEMBER);

        syncAs(tokenOf(member), clubId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        // 권한 차단으로 BANK API 호출에 도달하지 않는다.
        assertThat(stubBankApiClient.capturedLookup).isNull();
    }

    @Test
    @DisplayName("accountPassword·residentNumber 는 BANK API 스텁에는 전달되지만, 적재된 raw_payload·응답 본문·예외 메시지에는 전혀 나타나지 않는다")
    void credentialsPassedToApiButNeverPersistedOrLeaked() {
        Club club = saveEnabledClub("보안동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        LocalDateTime now = LocalDateTime.now();
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(now.minusDays(1), 30000L, "홍길동"),
                withdrawal(now.minusDays(1), 10000L, "임대료"));

        Response response = syncAs(tokenOf(leader), clubId);
        response.then().statusCode(HttpStatus.OK.value());

        // (1) 인증정보가 BANK API 로는 실제 전달됐다 — 동기화가 자격증명을 사용한다는 사실 증명.
        TransactionLookupCommand captured = stubBankApiClient.capturedLookup;
        assertThat(captured).isNotNull();
        assertThat(captured.accountPassword()).isEqualTo(ACCOUNT_PASSWORD);
        assertThat(captured.residentNumber()).isEqualTo(RESIDENT_NUMBER);

        // (2) 적재된 raw_payload 어디에도 인증정보가 없다 — raw_payload 는 BANK API 응답 거래만 담는다.
        List<String> rawPayloads = jdbcTemplate.queryForList(
                "SELECT raw_payload::text FROM bank_transaction WHERE club_id = ?", String.class, clubId);
        assertThat(rawPayloads).isNotEmpty();
        for (String rawPayload : rawPayloads) {
            assertThat(rawPayload).doesNotContain(ACCOUNT_PASSWORD);
            assertThat(rawPayload).doesNotContain(RESIDENT_NUMBER);
        }

        // (3) 응답 본문 JSON 에도 인증정보가 없다.
        String responseBody = response.asString();
        assertThat(responseBody).doesNotContain(ACCOUNT_PASSWORD);
        assertThat(responseBody).doesNotContain(RESIDENT_NUMBER);
    }

    @Test
    @DisplayName("동기화가 던지는 예외 메시지에도 인증정보(계좌 비번·주민번호)가 나타나지 않는다")
    void exceptionMessageDoesNotLeakCredentials() {
        Club club = saveNotEnabledClub("예외동아리"); // 사용 불가 → BankMatchingNotEnabledException(403)
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);

        String errorBody = syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .extract().asString();

        assertThat(errorBody).doesNotContain(ACCOUNT_PASSWORD);
        assertThat(errorBody).doesNotContain(RESIDENT_NUMBER);
    }
}
