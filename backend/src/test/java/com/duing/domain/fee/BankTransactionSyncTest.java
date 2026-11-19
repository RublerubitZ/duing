package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;

import com.duing.common.FixedClockConfig;
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
import com.duing.domain.fee.service.BankMatchingAdminService;
import com.duing.domain.fee.service.TransactionMatcher;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.bank.BankApiClient;
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.bank.dto.TransactionLookupResult;
import com.duing.global.bank.exception.BankApiException;
import com.duing.global.crypto.FeeAccountCipher;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@Import({TestcontainersConfiguration.class, FixedClockConfig.class, BankTransactionSyncTest.StubBankApiConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ExtendWith(OutputCaptureExtension.class)
class BankTransactionSyncTest extends IntegrationTestBase {

    // 동기화 호출에 쓰는 민감 인증정보 — 적재·응답·로그·예외 어디에도 나타나면 안 된다(보안 회귀 단언 기준값).
    private static final String ACCOUNT_PASSWORD = "secretPw1234";
    private static final String RESIDENT_NUMBER = "900101";

    /** 고정 시계의 '지금'(TODAY 00:00 KST) — 동기화가 은행 호출 전에 잡아 기록하는 시각. */
    private static final Instant SYNC_STARTED_AT =
            FixedClockConfig.TODAY.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant();

    /**
     * 외부 BANK API 를 대체하는 stub. 반환할 거래 목록·끝까지 읽었는지·실패를 테스트가 주입할 수 있고,
     * {@link #getTransactions(TransactionLookupCommand)} 가 받은 입력(인증정보 포함)을 캡처해
     * "인증정보가 BANK API 에는 전달되지만 적재/응답에는 새지 않는다" 를 검증할 수 있게 한다.
     */
    static class StubBankApiClient implements BankApiClient {

        volatile List<BankTransactionData> transactionsToReturn = List.of();
        // false 면 '건너뛴 거래가 있는 응답'을 흉내 낸다.
        volatile boolean fullyRead = true;
        // 있으면 조회가 이 예외로 끝난다(은행 호출 실패).
        volatile RuntimeException failure;
        // 은행 호출이 도는 동안 일어나는 일(그새 자동매칭을 끄는 경합 등).
        volatile Runnable duringLookup;
        // 거래 조회가 받은 입력을 그대로 캡처한다 — 인증정보가 API 로 넘어갔는지 단언용.
        volatile TransactionLookupCommand capturedLookup;

        void reset() {
            transactionsToReturn = List.of();
            fullyRead = true;
            failure = null;
            duringLookup = null;
            capturedLookup = null;
        }

        @Override
        public TransactionLookupResult getTransactions(TransactionLookupCommand command) {
            this.capturedLookup = command;
            if (duringLookup != null) {
                duringLookup.run();
            }
            if (failure != null) {
                throw failure;
            }
            return new TransactionLookupResult(transactionsToReturn, fullyRead);
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
    @Autowired
    BankMatchingAdminService bankMatchingAdminService;
    // 자동매칭 실패를 주입할 때만 스텁한다. 스텁하지 않으면 실제 매칭을 그대로 돌고, 스텁은 테스트마다 초기화된다.
    @MockitoSpyBean
    TransactionMatcher transactionMatcher;

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

    /** 이전 동기화가 남긴 거래 1건을 그 날짜 10:00(KST)으로 적재한다 — 마지막 거래일 기준점. bankCode 로 옛 계좌 거래를 흉내 낸다. */
    private void insertStoredTransaction(Long clubId, String bankCode, LocalDate kstDate) {
        jdbcTemplate.update("""
                INSERT INTO bank_transaction
                    (club_id, bank_code, transaction_at, amount, balance, counterparty,
                     transaction_type, match_status, matched_fee_bill_id, transaction_hash,
                     raw_payload, created_at, updated_at)
                VALUES (?, ?, ?::timestamptz, 10000, 50000, NULL, 'DEPOSIT', 'IGNORED', NULL, ?, '{}'::jsonb, now(), now())
                """,
                clubId, bankCode, kstDate.atTime(10, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant().toString(),
                "seed-" + clubId + "-" + kstDate);
    }

    /** 이전 동기화가 남긴 마지막 동기화 시각을 심는다. */
    private void seedLastSyncedAt(Long clubId, Instant lastSyncedAt) {
        jdbcTemplate.update("UPDATE bank_matching_setting SET last_synced_at = ?::timestamptz WHERE club_id = ?",
                lastSyncedAt.toString(), clubId);
    }

    private Instant lastSyncedAtOf(Long clubId) {
        return bankMatchingSettingRepository.findByClubId(clubId).orElseThrow().getLastSyncedAt();
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

    @Test
    @DisplayName("마지막 거래가 30일 전이면 그날부터(오늘 포함 31일) 조회해 쉰 기간을 다시 받고 빠진 기간은 없다")
    void syncRefetchesIdleGapWithinCap() {
        Club club = saveEnabledClub("쉰기간동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        insertStoredTransaction(clubId, "NH", FixedClockConfig.TODAY.minusDays(30)); // 05-16

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.missedFrom", nullValue())
                .body("data.missedTo", nullValue());

        // 수정 전 시작일: max(05-15, 06-01) = 06-01
        assertThat(stubBankApiClient.capturedLookup.startDate()).isEqualTo(LocalDate.of(2026, 5, 16));
        assertThat(stubBankApiClient.capturedLookup.endDate()).isEqualTo(FixedClockConfig.TODAY);
    }

    @Test
    @DisplayName("계좌를 바꾼 뒤 옛 계좌의 마지막 거래가 2일 전이어도 14일 전부터 조회해 새 계좌의 앞선 입금을 적재한다")
    void syncAfterAccountChangeRefetchesLookback() {
        Club club = saveEnabledClub("계좌교체동아리"); // 현재 계좌 NH
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        insertStoredTransaction(clubId, "KB", FixedClockConfig.TODAY.minusDays(2)); // 옛 계좌의 마지막 거래 06-13
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(FixedClockConfig.TODAY.minusDays(10).atTime(9, 0), 30000L, "홍길동")); // 새 계좌 06-05 입금

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.newlyStored", equalTo(1));

        // 수정 전 시작일: max(06-12, 06-01) = 06-12 — 06-05 입금은 조회 기간 밖이었다
        assertThat(stubBankApiClient.capturedLookup.startDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    }

    @Test
    @DisplayName("마지막 거래일이 조회 상한보다 앞이면 최근 31일만 조회하고 못 불러온 기간(마지막 거래일~조회 시작 전날)을 응답에 담는다")
    void syncBeyondCapReportsMissedRange() {
        Club club = saveEnabledClub("상한초과동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        insertStoredTransaction(clubId, "NH", FixedClockConfig.TODAY.minusDays(45)); // 05-01

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.missedFrom", equalTo("2026-05-01"))  // 수정 전 필드 없음
                .body("data.missedTo", equalTo("2026-05-15"));

        // 수정 전 시작일: 06-01
        assertThat(stubBankApiClient.capturedLookup.startDate()).isEqualTo(LocalDate.of(2026, 5, 16));
    }

    @Test
    @DisplayName("마지막 동기화 시각은 KST 날짜로 읽는다 — KST 새벽(UTC 로는 전날)에 동기화했으면 그 KST 날짜의 전날부터 조회한다")
    void lastSyncedAtIsReadAsKstDate() {
        Club club = saveEnabledClub("동기화기억동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        // 05-26 03:00 KST = 05-25T18:00Z
        seedLastSyncedAt(clubId,
                FixedClockConfig.TODAY.minusDays(20).atTime(3, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant());

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.missedFrom", nullValue())
                .body("data.missedTo", nullValue());

        // 수정 전 시작일 06-01(기억을 읽지 않음). UTC 날짜(05-25)로 읽으면 05-24.
        assertThat(stubBankApiClient.capturedLookup.startDate()).isEqualTo(LocalDate.of(2026, 5, 25));
    }

    @Test
    @DisplayName("마지막 거래가 30일보다 오래된 동아리가 연달아 동기화하면 못 본 기간은 첫 번째에만 돌려주고 두 번째는 14일 전부터 조회한다")
    void missedRangeIsReportedOnlyOnce() {
        Club club = saveEnabledClub("한번경고동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        insertStoredTransaction(clubId, "NH", FixedClockConfig.TODAY.minusDays(45)); // 05-01

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.missedFrom", equalTo("2026-05-01"))
                .body("data.missedTo", equalTo("2026-05-15"));
        assertThat(stubBankApiClient.capturedLookup.startDate()).isEqualTo(LocalDate.of(2026, 5, 16));

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.missedFrom", nullValue())   // 수정 전 2026-05-01(매번 같은 경고)
                .body("data.missedTo", nullValue());
        // 수정 전 05-16(매번 상한까지 조회). 기억이 오늘이어도 최소 14일은 다시 본다.
        assertThat(stubBankApiClient.capturedLookup.startDate()).isEqualTo(FixedClockConfig.TODAY.minusDays(14));
    }

    @Test
    @DisplayName("새 거래를 적재한 동기화도 은행 호출 전에 잡은 시각을 마지막 동기화 시각으로 남긴다")
    void recordsLastSyncedAtAfterStoringTransactions() {
        Club club = saveEnabledClub("적재기억동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(FixedClockConfig.TODAY.minusDays(1).atTime(9, 0), 30000L, "홍길동"),
                withdrawal(FixedClockConfig.TODAY.minusDays(1).atTime(10, 0), 10000L, "임대료"));

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.newlyStored", equalTo(2));

        // 적재의 네이티브 INSERT 가 영속성 컨텍스트를 비워도 기록이 남는다(수정 전 null).
        assertThat(lastSyncedAtOf(clubId)).isEqualTo(SYNC_STARTED_AT);
    }

    @Test
    @DisplayName("거래 0건으로 끝난 동기화도 마지막 동기화 시각을 남긴다")
    void recordsLastSyncedAtWithoutTransactions() {
        Club club = saveEnabledClub("빈조회기억동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.fetched", equalTo(0));

        // 수정 전 null
        assertThat(lastSyncedAtOf(clubId)).isEqualTo(SYNC_STARTED_AT);
    }

    @Test
    @DisplayName("이미 기억한 마지막 동기화 시각은 뒤 동기화가 끝까지 읽으면 그 동기화의 시각으로 옮겨진다")
    void laterSyncMovesExistingMemoryForward() {
        Club club = saveEnabledClub("기억갱신동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        // 20일 전 동기화의 기억 — 05-26 00:00 KST = 05-25T15:00Z
        seedLastSyncedAt(clubId, FixedClockConfig.TODAY.minusDays(20).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant());

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value());

        // 수정 전 05-25T15:00Z 그대로
        assertThat(lastSyncedAtOf(clubId)).isEqualTo(SYNC_STARTED_AT);
    }

    @Test
    @DisplayName("은행 조회가 실패하면 마지막 동기화 시각을 남기지 않는다")
    void doesNotRecordWhenLookupFails() {
        Club club = saveEnabledClub("조회실패동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        stubBankApiClient.failure = new BankApiException.BankApiCallFailedException();

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.BAD_GATEWAY.value());

        assertThat(lastSyncedAtOf(clubId)).isNull();
    }

    @Test
    @DisplayName("응답을 끝까지 읽지 못했으면 읽은 거래는 적재하되 마지막 동기화 시각은 남기지 않는다")
    void doesNotRecordWhenNotFullyRead() {
        Club club = saveEnabledClub("일부읽음동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        stubBankApiClient.fullyRead = false;
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(FixedClockConfig.TODAY.minusDays(1).atTime(9, 0), 30000L, "홍길동"));

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.newlyStored", equalTo(1));

        assertThat(lastSyncedAtOf(clubId)).isNull();
    }

    @Test
    @DisplayName("적재가 실패해 롤백되면 마지막 동기화 시각도 남지 않는다")
    void doesNotRecordWhenPersistRollsBack() {
        Club club = saveEnabledClub("적재실패동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        // bank_transaction.counterparty 는 VARCHAR(100)(V63) — 101자 거래는 INSERT 에서 실패해 적재 트랜잭션 전체가 롤백된다.
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(FixedClockConfig.TODAY.minusDays(1).atTime(9, 0), 30000L, "가".repeat(101)));

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.CONFLICT.value());   // DataIntegrityViolationException → GlobalExceptionHandler 409

        assertThat(lastSyncedAtOf(clubId)).isNull();
        Integer rowCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_transaction WHERE club_id = ?", Integer.class, clubId);
        assertThat(rowCount).isZero();
    }

    @Test
    @DisplayName("자동매칭을 껐다 켜면 마지막 동기화 시각이 비고, 다음 동기화는 다시 마지막 거래 기준으로 못 본 기간을 돌려준다")
    void reEnablingForgetsLastSync() {
        Club club = saveEnabledClub("재등록동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        insertStoredTransaction(clubId, "NH", FixedClockConfig.TODAY.minusDays(45)); // 05-01
        syncAs(tokenOf(leader), clubId).then().statusCode(HttpStatus.OK.value());
        assertThat(lastSyncedAtOf(clubId)).isEqualTo(SYNC_STARTED_AT);   // 수정 전 null

        bankMatchingAdminService.setActive(clubId, false);
        assertThat(lastSyncedAtOf(clubId)).isNull();
        bankMatchingAdminService.setActive(clubId, true);

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.missedFrom", equalTo("2026-05-01"))
                .body("data.missedTo", equalTo("2026-05-15"));
        assertThat(stubBankApiClient.capturedLookup.startDate()).isEqualTo(LocalDate.of(2026, 5, 16));
    }

    @Test
    @DisplayName("은행 조회가 도는 동안 자동매칭이 꺼지면 동기화가 끝난 뒤에도 꺼진 채이고 마지막 동기화 시각도 남지 않는다")
    void deactivatedDuringLookupStaysOffWithoutMemory() {
        Club club = saveEnabledClub("조회중해제동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        // 은행 호출은 트랜잭션 밖이라, 그새 총동연의 끄기가 따로 커밋된다.
        stubBankApiClient.duringLookup = () -> bankMatchingAdminService.setActive(clubId, false);

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.OK.value());

        BankMatchingSetting setting = bankMatchingSettingRepository.findByClubId(clubId).orElseThrow();
        assertThat(setting.isActive()).isFalse();
        assertThat(setting.getLastSyncedAt()).isNull();
    }

    @Test
    @DisplayName("적재 뒤 자동매칭에서 잡지 않는 예외가 나 응답이 오류면 마지막 동기화 시각을 남기지 않는다")
    void doesNotRecordWhenAutoMatchFails() {
        Club club = saveEnabledClub("매칭실패동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(FixedClockConfig.TODAY.minusDays(1).atTime(9, 0), 30000L, "홍길동"));
        // 매칭이 잡는 도메인 예외 3종 밖(일시적 DB 오류·잠금 실패 등)을 흉내 낸다 — 적재는 이미 커밋된 뒤다.
        doThrow(new IllegalStateException("주입된 자동매칭 실패")).when(transactionMatcher).tryAutoMatch(any(), anyLong());

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.INTERNAL_SERVER_ERROR.value());

        // 수정 전 2026-06-14T15:00:00Z(적재 트랜잭션에서 이미 기록)
        assertThat(lastSyncedAtOf(clubId)).isNull();
    }

    @Test
    @DisplayName("못 본 기간이 생기면 응답이 오류로 끝나도 clubId 와 두 날짜만 서버 로그에 한 줄 남긴다")
    void logsMissedRangeEvenWhenResponseFails(CapturedOutput output) {
        Club club = saveEnabledClub("경고로그동아리");
        Long clubId = club.getId();
        User leader = joinAs(club, ClubMemberRole.LEADER);
        insertStoredTransaction(clubId, "NH", FixedClockConfig.TODAY.minusDays(45)); // 05-01
        stubBankApiClient.transactionsToReturn = List.of(
                deposit(FixedClockConfig.TODAY.minusDays(1).atTime(9, 0), 30000L, "홍길동"));
        doThrow(new IllegalStateException("주입된 자동매칭 실패")).when(transactionMatcher).tryAutoMatch(any(), anyLong());

        syncAs(tokenOf(leader), clubId)
                .then().statusCode(HttpStatus.INTERNAL_SERVER_ERROR.value());

        // 수정 전 로그 없음. 줄 끝까지 고정해 거래·계좌·인증정보가 함께 실리지 않았음을 본다.
        assertThat(output.getOut()).containsPattern(
                "(?m)못 본 기간: clubId=" + clubId + ", missedFrom=2026-05-01, missedTo=2026-05-15$");
    }
}
