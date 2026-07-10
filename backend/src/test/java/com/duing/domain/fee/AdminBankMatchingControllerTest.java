package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.bank.BankApiClient;
import com.duing.global.bank.dto.AccountSlotStatus;
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.bank.exception.BankApiException;
import com.duing.global.crypto.FeeAccountCipher;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
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

@Import({TestcontainersConfiguration.class, AdminBankMatchingControllerTest.StubBankApiConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminBankMatchingControllerTest extends IntegrationTestBase {

    /**
     * 외부 BANK API 를 대체하는 제어 가능한 stub. 테스트마다 동작(등록 성공 / 한도 초과 throw / 슬롯 현황)을
     * 조정할 수 있고, 호출 인자와 호출 순서를 기록해 원자성(외부 호출이 DB 변이보다 먼저인지)을 검증한다.
     */
    static class StubBankApiClient implements BankApiClient {

        // 호출 순서를 기록한다 — "registerAccount" 가 setActive 의 DB 변이보다 먼저 일어났는지 증명용.
        final List<String> calls = new ArrayList<>();
        final List<String> registeredBankCodes = new ArrayList<>();
        final List<String> registeredAccountNumbers = new ArrayList<>();

        // register 가 던질 예외를 주입하면 등록 실패를 시뮬레이션한다(null 이면 성공).
        volatile RuntimeException registerFailure;
        volatile AccountSlotStatus slotStatus = new AccountSlotStatus(0, 5, 5);
        // getAccountStatus 가 던질 예외를 주입하면 BANK API 슬롯 조회 장애를 시뮬레이션한다(null 이면 정상).
        volatile RuntimeException accountStatusFailure;

        void reset() {
            calls.clear();
            registeredBankCodes.clear();
            registeredAccountNumbers.clear();
            registerFailure = null;
            slotStatus = new AccountSlotStatus(0, 5, 5);
            accountStatusFailure = null;
        }

        @Override
        public void registerAccount(String bankCode, String accountNumber) {
            calls.add("registerAccount");
            registeredBankCodes.add(bankCode);
            registeredAccountNumbers.add(accountNumber);
            if (registerFailure != null) {
                throw registerFailure;
            }
        }

        @Override
        public void deleteAccount(String bankCode, String accountNumber) {
            calls.add("deleteAccount");
            registeredBankCodes.add(bankCode);
            registeredAccountNumbers.add(accountNumber);
        }

        @Override
        public AccountSlotStatus getAccountStatus() {
            calls.add("getAccountStatus");
            if (accountStatusFailure != null) {
                throw accountStatusFailure;
            }
            return slotStatus;
        }

        @Override
        public List<BankTransactionData> getTransactions(TransactionLookupCommand command) {
            calls.add("getTransactions");
            return List.of();
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
    FeeAccountRepository feeAccountRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    FeeAccountCipher feeAccountCipher;
    @Autowired
    StubBankApiClient stubBankApiClient;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        stubBankApiClient.reset();

        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq, "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    /** clubId 동아리에 지정 은행의 회비 계좌(암호문)를 등록하고 clubId 를 반환한다. */
    private Long saveClubWithAccount(String clubName, Bank bank, String plaintextAccountNumber) {
        Club club = clubRepository.save(ClubFixture.academic(clubName));
        Long clubId = club.getId();
        String encrypted = feeAccountCipher.encrypt(plaintextAccountNumber, clubId);
        feeAccountRepository.save(FeeAccount.create(clubId, bank, encrypted, "동아리회비"));
        return clubId;
    }

    private void putBankMatchingAs(String token, Long clubId, boolean active, int expectedStatus) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(Map.of("active", active))
                .when().put("/api/v1/admin/clubs/" + clubId + "/bank-matching")
                .then().statusCode(expectedStatus);
    }

    /** 설정 행이 없으면 null, 있으면 active 값을 반환한다(등록 실패 시 행 자체가 없을 수 있다). */
    private Boolean readSettingActive(Long clubId) {
        List<Boolean> rows = jdbcTemplate.queryForList(
                "SELECT active FROM bank_matching_setting WHERE club_id = ? AND deleted_at IS NULL",
                Boolean.class, clubId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    @Test
    @DisplayName("적격 동아리 자동매칭을 활성화하면 복호화된 계좌번호로 registerAccount 가 호출되고 설정이 active=api_registered=true 가 된다")
    void activateEligibleClubRegistersAndPersists() {
        Long clubId = saveClubWithAccount("적격동아리", Bank.NH, "352-1234-5678-90");

        putBankMatchingAs(adminToken, clubId, true, HttpStatus.NO_CONTENT.value());

        // 외부 등록이 호출되고 올바른 은행 코드로 전달됐다.
        assertThat(stubBankApiClient.calls).contains("registerAccount");
        assertThat(stubBankApiClient.registeredBankCodes).containsExactly("NH");
        // 복호화된 평문 계좌번호가 그대로 외부 등록에 전달됐다 — 복호화 + 전달 경로를 증명한다.
        assertThat(stubBankApiClient.registeredAccountNumbers).containsExactly("352-1234-5678-90");

        // 외부 등록 성공 후에야 DB 설정이 사용 가능 상태로 반영됐다.
        Map<String, Object> setting = jdbcTemplate.queryForMap(
                "SELECT active, api_registered FROM bank_matching_setting WHERE club_id = ?", clubId);
        assertThat(setting.get("active")).isEqualTo(true);
        assertThat(setting.get("api_registered")).isEqualTo(true);
    }

    @Test
    @DisplayName("BANK API 등록이 한도 초과로 실패하면 400 을 반환하고 설정은 변경되지 않으며, registerAccount 가 DB 변이보다 먼저 호출된다(원자성)")
    void registerFailureLeavesDbUnchanged() {
        Long clubId = saveClubWithAccount("한도초과동아리", Bank.KB, "111-222-333");
        // stub 이 등록 시 한도 초과 예외를 던지도록 설정한다.
        stubBankApiClient.registerFailure = new BankApiException.AccountLimitExceededException();

        putBankMatchingAs(adminToken, clubId, true, HttpStatus.BAD_REQUEST.value());

        // 외부 호출은 시도됐다(원자성: 외부 등록이 선행).
        assertThat(stubBankApiClient.calls).contains("registerAccount");

        // 등록 실패 후 DB 설정은 미변경 — 트랜잭션 롤백으로 행이 없거나(null), 있더라도 active=false 다.
        // activate() 는 registerAccount 성공 이후에만 도달하므로 active·api_registered 둘 다 true 가 될 수 없다(원자성).
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT active, api_registered FROM bank_matching_setting WHERE club_id = ? AND deleted_at IS NULL",
                clubId);
        if (!rows.isEmpty()) {
            assertThat(rows.get(0).get("active"))
                    .as("등록 실패 시 active 는 true 로 바뀌지 않아야 한다(원자성)").isEqualTo(false);
            assertThat(rows.get(0).get("api_registered"))
                    .as("등록 실패 시 api_registered 도 true 로 바뀌지 않아야 한다(부분 변이 금지)").isEqualTo(false);
        }
    }

    @Test
    @DisplayName("회비 계좌가 없는 동아리의 자동매칭을 활성화하면 409 를 반환한다")
    void activateWithoutFeeAccountConflict() {
        Club club = clubRepository.save(ClubFixture.academic("계좌없는동아리"));

        putBankMatchingAs(adminToken, club.getId(), true, HttpStatus.CONFLICT.value());

        // 계좌가 없으면 외부 등록을 시도하지 않는다.
        assertThat(stubBankApiClient.calls).doesNotContain("registerAccount");
    }

    @Test
    @DisplayName("지원하지 않는 은행(신한) 계좌 동아리의 자동매칭을 활성화하면 400 을 반환한다")
    void activateUnsupportedBankBadRequest() {
        Long clubId = saveClubWithAccount("신한동아리", Bank.SHINHAN, "100-200-300");

        putBankMatchingAs(adminToken, clubId, true, HttpStatus.BAD_REQUEST.value());

        // 미지원 은행이면 외부 등록을 시도하지 않는다.
        assertThat(stubBankApiClient.calls).doesNotContain("registerAccount");
    }

    @Test
    @DisplayName("활성화된 동아리의 자동매칭을 비활성화하면 deleteAccount 가 호출되고 설정이 active=false 가 된다")
    void deactivateCallsDeleteAndPersists() {
        Long clubId = saveClubWithAccount("우리동아리", Bank.WOORI, "1002-345-678901");

        // 먼저 활성화한다.
        putBankMatchingAs(adminToken, clubId, true, HttpStatus.NO_CONTENT.value());
        assertThat(readSettingActive(clubId)).isTrue();

        // 비활성화한다.
        putBankMatchingAs(adminToken, clubId, false, HttpStatus.NO_CONTENT.value());

        assertThat(stubBankApiClient.calls).contains("deleteAccount");
        assertThat(readSettingActive(clubId)).isFalse();
        Boolean apiRegistered = jdbcTemplate.queryForObject(
                "SELECT api_registered FROM bank_matching_setting WHERE club_id = ?", Boolean.class, clubId);
        assertThat(apiRegistered).isFalse();
    }

    @Test
    @DisplayName("ADMIN 이 아닌 사용자가 자동매칭 허용 API 를 호출하면 403 을 반환한다")
    void nonAdminForbidden() {
        Long clubId = saveClubWithAccount("동아리", Bank.NH, "352-1234-5678-90");

        putBankMatchingAs(studentToken, clubId, true, HttpStatus.FORBIDDEN.value());

        // 권한 차단으로 외부 호출에 도달하지 않는다.
        assertThat(stubBankApiClient.calls).doesNotContain("registerAccount");
    }

    @Test
    @DisplayName("ADMIN 이 자동매칭 현황을 조회하면 동아리별 적격·등록 상태와 슬롯 현황이 반환된다")
    void overviewReturnsClubsAndSlots() {
        Long eligibleClubId = saveClubWithAccount("적격동아리", Bank.NH, "352-1234-5678-90");
        saveClubWithAccount("미지원동아리", Bank.SHINHAN, "100-200-300");
        putBankMatchingAs(adminToken, eligibleClubId, true, HttpStatus.NO_CONTENT.value());
        stubBankApiClient.slotStatus = new AccountSlotStatus(1, 5, 4);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/bank-matching")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.clubs.size()", equalTo(2))
                .body("data.slots.registeredCount", equalTo(1))
                .body("data.slots.maxAccounts", equalTo(5))
                .body("data.slots.remaining", equalTo(4))
                .body("data.clubs.find { it.clubName == '미지원동아리' }.bank", equalTo("SHINHAN"));
    }

    @Test
    @DisplayName("BANK API 슬롯 조회가 장애로 실패해도 현황 조회는 동아리 목록을 반환하고 슬롯만 비운다")
    void overviewDegradesWhenBankApiDown() {
        saveClubWithAccount("적격동아리", Bank.NH, "352-1234-5678-90");
        saveClubWithAccount("미지원동아리", Bank.SHINHAN, "100-200-300");
        // BANK API 슬롯 조회가 일시 장애로 예외를 던지도록 설정한다.
        stubBankApiClient.accountStatusFailure = new BankApiException.BankApiCallFailedException();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/bank-matching")
                .then().statusCode(HttpStatus.OK.value())
                // 외부 호출이 필요 없는 동아리 목록은 그대로 반환된다.
                .body("data.clubs.size()", equalTo(2))
                // 슬롯 현황만 비워진다(graceful degrade) — 502 로 페이지 전체가 죽지 않는다.
                .body("data.slots", nullValue());
    }

    @Test
    @DisplayName("현황 조회 응답에 동아리별 은행·예금주·마스킹 계좌번호가 채워진다")
    void overviewIncludesMaskedAccountFields() {
        saveClubWithAccount("적격동아리", Bank.NH, "352-1234-5678-90");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/bank-matching")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.clubs.find { it.clubName == '적격동아리' }.bank", equalTo("NH"))
                .body("data.clubs.find { it.clubName == '적격동아리' }.accountHolder", equalTo("동아리회비"))
                .body("data.clubs.find { it.clubName == '적격동아리' }.maskedAccountNumber", equalTo("****7890"));
    }

    @Test
    @DisplayName("한 계좌의 복호화가 실패해도 그 행만 maskedAccountNumber=null 로 비우고 나머지·페이지는 정상 반환된다")
    void overviewDegradesPerRowOnDecryptFailure() {
        saveClubWithAccount("정상동아리", Bank.NH, "352-1234-5678-90");
        // 유효한 base64 가 아닌 손상된 암호문을 직접 저장해 복호화 실패를 유발한다.
        Club broken = clubRepository.save(ClubFixture.academic("손상동아리"));
        feeAccountRepository.save(FeeAccount.create(broken.getId(), Bank.KB, "not-a-valid-ciphertext", "총무"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/bank-matching")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.clubs.size()", equalTo(2))
                .body("data.clubs.find { it.clubName == '정상동아리' }.maskedAccountNumber", equalTo("****7890"))
                .body("data.clubs.find { it.clubName == '손상동아리' }.bank", equalTo("KB"))
                .body("data.clubs.find { it.clubName == '손상동아리' }.accountHolder", equalTo("총무"))
                .body("data.clubs.find { it.clubName == '손상동아리' }.maskedAccountNumber", nullValue());
    }
}
