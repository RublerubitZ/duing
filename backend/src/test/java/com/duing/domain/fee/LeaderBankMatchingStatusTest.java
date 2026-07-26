package com.duing.domain.fee;

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
import io.restassured.response.Response;
import java.util.List;
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

@Import({TestcontainersConfiguration.class, LeaderBankMatchingStatusTest.StubBankApiConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderBankMatchingStatusTest extends IntegrationTestBase {

    /** 상태 조회는 외부 BANK API 를 호출하지 않지만, 컨텍스트 구성을 위해 호출하지 않는 stub 을 둔다. */
    static class StubBankApiClient implements BankApiClient {

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
    FeeAccountRepository feeAccountRepository;
    @Autowired
    BankMatchingSettingRepository bankMatchingSettingRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    FeeAccountCipher feeAccountCipher;
    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    /** 지정한 은행 계좌를 가진 동아리를 만든다. usableSetting=true 면 사용 가능(active && api_registered) 설정도 저장한다. */
    private Club saveClubWithAccount(String clubName, Bank bank, boolean usableSetting) {
        Club club = clubRepository.save(ClubFixture.academic(clubName));
        Long clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 자동매칭 상태 조회(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
        String encrypted = feeAccountCipher.encrypt("352-1234-5678-90", clubId);
        feeAccountRepository.save(FeeAccount.create(clubId, bank, encrypted, "동아리회비"));
        if (usableSetting) {
            BankMatchingSetting setting = BankMatchingSetting.of(clubId);
            setting.activate(); // active=true, api_registered=true → isUsable()
            bankMatchingSettingRepository.save(setting);
        }
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

    private Response statusAs(String token, Long clubId) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/leader/clubs/" + clubId + "/bank-matching");
    }

    @Test
    @DisplayName("지원 은행 계좌와 사용 가능한 설정을 갖춘 동아리는 자동매칭 사용 가능(enabled=true)으로 조회된다")
    void enabledClubReturnsTrue() {
        Club club = saveClubWithAccount("사용가능동아리", Bank.NH, true);
        User leader = joinAs(club, ClubMemberRole.LEADER);

        statusAs(tokenOf(leader), club.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(true));
    }

    @Test
    @DisplayName("OFFICER 도 자기 동아리의 자동매칭 사용 가능 여부를 조회할 수 있다")
    void officerCanQueryStatus() {
        Club club = saveClubWithAccount("임원동아리", Bank.NH, true);
        User officer = joinAs(club, ClubMemberRole.OFFICER);

        statusAs(tokenOf(officer), club.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(true));
    }

    @Test
    @DisplayName("자동매칭 설정이 없는 동아리는 사용 불가(enabled=false)로 조회된다 — 동기화를 시도하지 않고도 알 수 있다")
    void notEnabledClubReturnsFalse() {
        Club club = saveClubWithAccount("미설정동아리", Bank.NH, false);
        User leader = joinAs(club, ClubMemberRole.LEADER);

        statusAs(tokenOf(leader), club.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(false));
    }

    @Test
    @DisplayName("설정은 사용 가능하지만 회비 계좌가 없는 동아리면 사용 불가(enabled=false)로 조회된다")
    void usableSettingWithoutAccountReturnsFalse() {
        Club club = clubRepository.save(ClubFixture.academic("계좌없는동아리"));
        // Club.create 기본 상태는 PENDING_APPROVAL — 자동매칭 상태 조회(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());
        BankMatchingSetting setting = BankMatchingSetting.of(club.getId());
        setting.activate();
        bankMatchingSettingRepository.save(setting);
        User leader = joinAs(club, ClubMemberRole.LEADER);

        statusAs(tokenOf(leader), club.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(false));
    }

    @Test
    @DisplayName("설정은 사용 가능하지만 지원하지 않는 은행 계좌면 사용 불가(enabled=false)로 조회된다")
    void unsupportedBankReturnsFalse() {
        Club club = saveClubWithAccount("미지원은행동아리", Bank.KAKAO, true);
        User leader = joinAs(club, ClubMemberRole.LEADER);

        statusAs(tokenOf(leader), club.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.enabled", equalTo(false));
    }

    @Test
    @DisplayName("운영진이 아닌 일반 회원은 자동매칭 사용 가능 여부를 조회할 수 없다")
    void nonManagerForbidden() {
        Club club = saveClubWithAccount("권한동아리", Bank.NH, true);
        User member = joinAs(club, ClubMemberRole.MEMBER);

        statusAs(tokenOf(member), club.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }
}
