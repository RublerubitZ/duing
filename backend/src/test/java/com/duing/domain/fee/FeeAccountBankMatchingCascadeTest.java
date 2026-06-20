package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
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
import com.duing.global.crypto.FeeAccountCipher;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
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

@Import({TestcontainersConfiguration.class, FeeAccountBankMatchingCascadeTest.StubBankApiConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FeeAccountBankMatchingCascadeTest extends IntegrationTestBase {

    /** 외부 BANK API 대체 stub. deleteAccount 실패를 주입해 never-block 정책을 검증한다. */
    static class StubBankApiClient implements BankApiClient {
        final List<String> calls = new ArrayList<>();
        volatile RuntimeException deleteFailure; // null 이면 성공

        void reset() {
            calls.clear();
            deleteFailure = null;
        }

        @Override
        public void registerAccount(String bankCode, String accountNumber) {
            calls.add("registerAccount");
        }

        @Override
        public void deleteAccount(String bankCode, String accountNumber) {
            calls.add("deleteAccount");
            if (deleteFailure != null) {
                throw deleteFailure;
            }
        }

        @Override
        public AccountSlotStatus getAccountStatus() {
            return new AccountSlotStatus(0, 5, 5);
        }

        @Override
        public List<BankTransactionData> getTransactions(TransactionLookupCommand command) {
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
    ClubMemberRepository clubMemberRepository;
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
    private String leaderToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        stubBankApiClient.reset();

        User admin = userRepository.save(adminUser());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());

        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
    }

    private User adminUser() {
        long seq = sequence.incrementAndGet();
        return User.create("20" + seq, "관리자" + seq, "admin" + seq + "@duing.ac.kr", "h",
                UserRole.ADMIN, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
                "010-0000-0000", LocalDateTime.now());
    }

    private void leaderUpsert(String bank, String accountNumber, String accountHolder, int expectedStatus) {
        Map<String, Object> body = new HashMap<>();
        body.put("bank", bank);
        body.put("accountNumber", accountNumber);
        body.put("accountHolder", accountHolder);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(body)
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(expectedStatus);
    }

    private void adminSetActive(boolean active) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("active", active))
                .when().put("/api/v1/admin/clubs/" + clubId + "/bank-matching")
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    private void leaderDelete(int expectedStatus) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(expectedStatus);
    }

    private Boolean readSettingActive() {
        List<Boolean> rows = jdbcTemplate.queryForList(
                "SELECT active FROM bank_matching_setting WHERE club_id = ? AND deleted_at IS NULL",
                Boolean.class, clubId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private boolean feeAccountExists() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM fee_account WHERE club_id = ? AND deleted_at IS NULL",
                Integer.class, clubId);
        return count != null && count > 0;
    }

    private String storedAccountNumber() {
        return jdbcTemplate.queryForObject(
                "SELECT account_number FROM fee_account WHERE club_id = ? AND deleted_at IS NULL",
                String.class, clubId);
    }

    @Test
    @DisplayName("자동매칭 활성 계좌를 운영진이 수정하려 하면 409 를 반환하고 저장된 계좌번호가 변경되지 않는다")
    void editActiveAccountConflict() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());
        adminSetActive(true);

        leaderUpsert("NH", "999-888-777", "총무", HttpStatus.CONFLICT.value());

        assertThat(feeAccountCipher.decrypt(storedAccountNumber(), clubId)).isEqualTo("352-1234-5678-90");
    }

    @Test
    @DisplayName("자동매칭 비활성 계좌는 운영진이 정상적으로 수정할 수 있다")
    void editInactiveAccountAllowed() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());

        leaderUpsert("KB", "111-222-333", "새총무", HttpStatus.OK.value());

        assertThat(feeAccountCipher.decrypt(storedAccountNumber(), clubId)).isEqualTo("111-222-333");
    }
}
