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
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.bank.BankApiClient;
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.crypto.FeeAccountCipher;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.util.ArrayList;
import java.util.HashMap;
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

@Import({TestcontainersConfiguration.class, FeeAccountBankMatchingCascadeTest.StubBankApiConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FeeAccountBankMatchingCascadeTest extends IntegrationTestBase {

    /** 외부 BANK API 대체 stub. 계좌 삭제 연쇄는 외부 호출이 없는 경로라 호출 여부만 기록한다. */
    static class StubBankApiClient implements BankApiClient {
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
    ClubMemberRepository clubMemberRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    FeeAccountCipher feeAccountCipher;
    @Autowired
    StubBankApiClient stubBankApiClient;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private String adminToken;
    private String leaderToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        stubBankApiClient.reset();

        User admin = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());

        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 회비 계좌 관리(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
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

    @Test
    @DisplayName("자동매칭 활성 계좌를 운영진이 삭제하면 설정이 비활성화되고 계좌가 soft delete 된다")
    void deleteActiveAccountCascades() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());
        adminSetActive(true);
        assertThat(readSettingActive()).isTrue();
        stubBankApiClient.calls.clear();

        leaderDelete(HttpStatus.NO_CONTENT.value());

        assertThat(readSettingActive()).isFalse();
        assertThat(feeAccountExists()).isFalse();
        // 정리할 외부 등록이 없으므로 삭제 연쇄는 외부 호출 없이 끝난다.
        assertThat(stubBankApiClient.calls).isEmpty();
    }

    @Test
    @DisplayName("자동매칭 설정이 없는 계좌도 정상적으로 soft delete 된다")
    void deleteWithoutSettingSucceeds() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());
        stubBankApiClient.calls.clear();

        leaderDelete(HttpStatus.NO_CONTENT.value());

        assertThat(feeAccountExists()).isFalse();
        assertThat(stubBankApiClient.calls).isEmpty();
    }

    @Test
    @DisplayName("계좌 복호화가 실패해도(키 회전·암호문 손상) 삭제는 성공하고 설정이 비활성화된다")
    void deleteNotBlockedByDecryptFailure() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());
        adminSetActive(true);
        assertThat(readSettingActive()).isTrue();
        // 활성화 후 암호문을 손상시켜(키 회전·at-rest 손상 모사) 복호화가 실패하도록 만든다.
        jdbcTemplate.update(
                "UPDATE fee_account SET account_number = 'not-a-valid-ciphertext' "
                        + "WHERE club_id = ? AND deleted_at IS NULL",
                clubId);
        stubBankApiClient.calls.clear();

        leaderDelete(HttpStatus.NO_CONTENT.value());

        // 삭제 경로는 계좌번호를 복호화하지 않으므로 손상된 암호문도 삭제를 막지 못한다.
        assertThat(readSettingActive()).isFalse();
        assertThat(feeAccountExists()).isFalse();
    }
}
