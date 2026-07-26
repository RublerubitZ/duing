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
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
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
     * 외부 BANK API 를 대체하는 stub. 자동매칭 허용/해제·현황 조회는 외부 호출이 전혀 없는 경로이므로
     * 호출이 기록되면 안 된다 — 각 테스트가 {@code calls} 가 비어 있음을 단언해 그것을 검사한다.
     * 실 HTTP 클라이언트가 테스트에서 뜨지 않게 막는 역할도 겸한다.
     */
    static class StubBankApiClient implements BankApiClient {

        // 외부 호출이 일어났는지 단언하기 위한 기록. 이 테스트들에선 항상 비어 있어야 한다.
        final List<String> calls = new ArrayList<>();

        void reset() {
            calls.clear();
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
    @DisplayName("적격 동아리 자동매칭을 활성화하면 설정이 active=api_registered=true 가 된다")
    void activateEligibleClubPersists() {
        Long clubId = saveClubWithAccount("적격동아리", Bank.NH, "352-1234-5678-90");

        putBankMatchingAs(adminToken, clubId, true, HttpStatus.NO_CONTENT.value());

        Map<String, Object> setting = jdbcTemplate.queryForMap(
                "SELECT active, api_registered FROM bank_matching_setting WHERE club_id = ?", clubId);
        assertThat(setting.get("active")).isEqualTo(true);
        assertThat(setting.get("api_registered")).isEqualTo(true);
        // 제공사에 계좌 등록 개념이 없으므로 허용 처리에 외부 호출이 끼어들지 않는다.
        assertThat(stubBankApiClient.calls).isEmpty();
    }

    @Test
    @DisplayName("회비 계좌가 없는 동아리의 자동매칭을 활성화하면 409 를 반환하고 설정이 생기지 않는다")
    void activateWithoutFeeAccountConflict() {
        Club club = clubRepository.save(ClubFixture.academic("계좌없는동아리"));

        putBankMatchingAs(adminToken, club.getId(), true, HttpStatus.CONFLICT.value());

        assertThat(readSettingActive(club.getId())).isNull();
    }

    @Test
    @DisplayName("지원하지 않는 은행(신한) 계좌 동아리의 자동매칭을 활성화하면 400 을 반환하고 설정이 생기지 않는다")
    void activateUnsupportedBankBadRequest() {
        Long clubId = saveClubWithAccount("신한동아리", Bank.SHINHAN, "100-200-300");

        putBankMatchingAs(adminToken, clubId, true, HttpStatus.BAD_REQUEST.value());

        assertThat(readSettingActive(clubId)).isNull();
    }

    @Test
    @DisplayName("활성화된 동아리의 자동매칭을 비활성화하면 설정이 active=false 가 된다")
    void deactivatePersists() {
        Long clubId = saveClubWithAccount("우리동아리", Bank.WOORI, "1002-345-678901");

        // 먼저 활성화한다.
        putBankMatchingAs(adminToken, clubId, true, HttpStatus.NO_CONTENT.value());
        assertThat(readSettingActive(clubId)).isTrue();

        // 비활성화한다.
        putBankMatchingAs(adminToken, clubId, false, HttpStatus.NO_CONTENT.value());

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

        assertThat(readSettingActive(clubId)).isNull();
    }

    @Test
    @DisplayName("ADMIN 이 자동매칭 현황을 조회하면 동아리별 적격·등록 상태와 등록 동아리 수가 반환된다")
    void overviewReturnsClubsAndRegisteredCount() {
        Long eligibleClubId = saveClubWithAccount("적격동아리", Bank.NH, "352-1234-5678-90");
        saveClubWithAccount("미지원동아리", Bank.SHINHAN, "100-200-300");
        putBankMatchingAs(adminToken, eligibleClubId, true, HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/bank-matching")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.clubs.size()", equalTo(2))
                .body("data.registeredCount", equalTo(1))
                .body("data.clubs.find { it.clubName == '미지원동아리' }.bank", equalTo("SHINHAN"));
    }

    @Test
    @DisplayName("현황 조회는 외부 BANK API 를 호출하지 않고 등록 수를 채운다(슬롯 조회 404 회귀 방지)")
    void overviewNeedsNoExternalCall() {
        saveClubWithAccount("적격동아리", Bank.NH, "352-1234-5678-90");
        saveClubWithAccount("미지원동아리", Bank.SHINHAN, "100-200-300");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/bank-matching")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.clubs.size()", equalTo(2))
                // 등록 수는 항상 채워진다 — 예전처럼 외부 장애로 비는(null) 경우가 없다.
                .body("data.registeredCount", equalTo(0));

        // 존재하지 않는 /v1/accounts 를 부르던 경로가 완전히 사라졌다.
        assertThat(stubBankApiClient.calls).isEmpty();
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
