package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FeeAccountControllerTest extends IntegrationTestBase {

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
    JdbcTemplate jdbcTemplate;

    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private String nonMemberToken;
    private String otherClubLeaderToken;
    private String otherClubMemberToken;
    private Long clubId;
    private Long otherClubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();

        User leader = userRepository.save(UserFixture.unique());
        User officer = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        User nonMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        // 다른 동아리(B) — 이 동아리(A)에 대해서는 멤버가 아니다.
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        otherClubId = otherClub.getId();
        User otherClubLeader = userRepository.save(UserFixture.unique());
        User otherClubMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherClubLeader));
        clubMemberRepository.save(ClubMember.of(otherClub, otherClubMember, ClubMemberRole.MEMBER));

        // Club.create 기본 상태는 PENDING_APPROVAL — 멤버용 회비 계좌 조회는 ACTIVE 동아리만
        // 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 두 동아리 모두 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id IN (?, ?)", clubId, otherClubId);

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
        nonMemberToken = jwtTokenProvider.createToken(nonMember.getId(), nonMember.getRole().name());
        otherClubLeaderToken =
                jwtTokenProvider.createToken(otherClubLeader.getId(), otherClubLeader.getRole().name());
        otherClubMemberToken =
                jwtTokenProvider.createToken(otherClubMember.getId(), otherClubMember.getRole().name());
    }

    private static Map<String, Object> accountBody(String bank, String accountNumber, String accountHolder) {
        Map<String, Object> body = new HashMap<>();
        body.put("bank", bank);
        body.put("accountNumber", accountNumber);
        body.put("accountHolder", accountHolder);
        return body;
    }

    private void upsertAs(String token, Map<String, Object> body) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(body)
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("운영진이 회비 계좌를 등록한 뒤 조회하면 제출한 평문 계좌번호가 그대로 반환된다")
    void upsertThenManagerGetReturnsSamePlaintext() {
        String plaintextAccountNumber = "352-1234-5678-90";
        upsertAs(officerToken, accountBody("KB", plaintextAccountNumber, "두잉동아리"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.bank", equalTo("KB"))
                .body("data.accountNumber", equalTo(plaintextAccountNumber))
                .body("data.accountHolder", equalTo("두잉동아리"));
    }

    @Test
    @DisplayName("등록된 계좌번호는 DB 에 평문이 아닌 암호문으로 저장되고, 조회 API 는 평문을 반환한다")
    void accountNumberIsEncryptedAtRest() {
        String plaintextAccountNumber = "1002-345-678901";
        upsertAs(leaderToken, accountBody("WOORI", plaintextAccountNumber, "총무"));

        // DB 원본 컬럼을 직접 조회 — 평문과 달라야 한다(암호문 저장 증명).
        String storedAccountNumber = jdbcTemplate.queryForObject(
                "SELECT account_number FROM fee_account WHERE club_id = ? AND deleted_at IS NULL",
                String.class, clubId);
        assertThat(storedAccountNumber)
                .as("저장된 계좌번호는 제출한 평문과 달라야 한다(암호문이어야 한다)")
                .isNotEqualTo(plaintextAccountNumber);

        // 반면 GET API 는 복호화된 평문을 반환한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.accountNumber", equalTo(plaintextAccountNumber));
    }

    @Test
    @DisplayName("한 동아리(A)의 계좌 암호문을 다른 동아리(B) 행에 끼워 넣고 B 멤버가 조회하면 "
            + "AAD(clubId) 불일치로 복호화가 실패해 500 을 반환한다(치환 방어)")
    void substitutedCiphertextFromAnotherClubFailsToDecrypt() {
        // 1) 동아리 A 에 계좌 등록 → 암호문은 A 의 clubId 에 AAD 로 바인딩된다.
        String plaintextAccountNumber = "352-1234-5678-90";
        upsertAs(leaderToken, accountBody("KB", plaintextAccountNumber, "동아리A회비"));

        // 2) 동아리 A 행의 원본 암호문을 직접 읽는다.
        String clubACiphertext = jdbcTemplate.queryForObject(
                "SELECT account_number FROM fee_account WHERE club_id = ? AND deleted_at IS NULL",
                String.class, clubId);

        // 3) 서비스/암호화를 우회해 동아리 B 행에 A 의 암호문을 그대로 INSERT 한다(치환 공격 모사).
        jdbcTemplate.update(
                "INSERT INTO fee_account (club_id, bank, account_number, account_holder) "
                        + "VALUES (?, ?, ?, ?)",
                otherClubId, "KB", clubACiphertext, "동아리B회비");

        // 4) 동아리 B 의 멤버가 B 의 계좌를 조회하면 AAD(clubId) 가 어긋나 복호화가 실패한다.
        //    A 의 평문 계좌번호가 새지 않고 복호화 실패 전용 응답으로 500 이 닫힌다(fail closed).
        //    message 까지 검증해 무관한 원인의 500(DB 오류 등)과 구별한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherClubMemberToken)
                .when().get("/api/v1/clubs/" + otherClubId + "/fee-account")
                .then().statusCode(HttpStatus.INTERNAL_SERVER_ERROR.value())
                .body("ok", equalTo(false))
                .body("data", org.hamcrest.Matchers.nullValue())
                .body("message", equalTo("회비 계좌 정보를 불러올 수 없습니다."))
                .body("accountNumber", org.hamcrest.Matchers.nullValue());
    }

    @Test
    @DisplayName("회비 계좌를 두 번 등록하면 새로 추가되지 않고 단일 행이 갱신된다")
    void upsertTwiceUpdatesSingleRow() {
        upsertAs(leaderToken, accountBody("KB", "111-111-111", "초기예금주"));
        upsertAs(leaderToken, accountBody("TOSS", "222-222-222", "변경예금주"));

        Long rowCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM fee_account WHERE club_id = ? AND deleted_at IS NULL",
                Long.class, clubId);
        assertThat(rowCount).isEqualTo(1L);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.bank", equalTo("TOSS"))
                .body("data.accountNumber", equalTo("222-222-222"))
                .body("data.accountHolder", equalTo("변경예금주"));
    }

    @Test
    @DisplayName("동아리원이 회비 계좌를 조회하면 복호화된 평문 계좌번호가 반환된다")
    void memberGetReturnsDecryptedAccount() {
        String plaintextAccountNumber = "333-444-5555";
        upsertAs(leaderToken, accountBody("NH", plaintextAccountNumber, "동아리회비"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.bank", equalTo("NH"))
                .body("data.accountNumber", equalTo(plaintextAccountNumber))
                .body("data.accountHolder", equalTo("동아리회비"));
    }

    @ParameterizedTest(name = "{0} 동아리의 멤버가 회비 계좌를 조회하면 403 과 상태별 안내 메시지를 반환한다")
    @EnumSource(value = ClubStatus.class, names = {"PENDING_APPROVAL", "REJECTED", "INACTIVE"})
    void nonActiveClubMemberGetForbidden(ClubStatus nonActiveStatus) {
        upsertAs(leaderToken, accountBody("KB", "777-777-777", "예금주"));
        jdbcTemplate.update("UPDATE club SET status = ? WHERE id = ?", nonActiveStatus.name(), clubId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false))
                .body("message", equalTo(expectedNonActiveClubMessage(nonActiveStatus)));
    }

    private static String expectedNonActiveClubMessage(ClubStatus clubStatus) {
        return switch (clubStatus) {
            case PENDING_APPROVAL -> "승인 대기 중인 동아리입니다.";
            case REJECTED -> "거절된 동아리입니다.";
            case INACTIVE -> "운영 종료된 동아리입니다.";
            default -> throw new IllegalArgumentException("비 ACTIVE 상태가 아닙니다: " + clubStatus);
        };
    }

    @Test
    @DisplayName("동아리원이 아닌 사용자가 회비 계좌를 조회하면 403 을 반환한다")
    void nonMemberGetForbidden() {
        upsertAs(leaderToken, accountBody("KB", "999-999-999", "예금주"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + nonMemberToken)
                .when().get("/api/v1/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("다른 동아리의 운영진이 이 동아리 회비 계좌를 조회하면 403 을 반환한다")
    void otherClubManagerForbidden() {
        upsertAs(leaderToken, accountBody("KB", "999-999-999", "예금주"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherClubLeaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("일반 멤버가 회비 계좌를 등록하면 403 을 반환한다")
    void memberUpsertForbidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .contentType(ContentType.JSON)
                .body(accountBody("KB", "123-456-789", "예금주"))
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("등록된 계좌가 없으면 운영진 조회는 404 를 반환한다")
    void managerGetNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("등록된 계좌가 없으면 동아리원 조회는 404 를 반환한다")
    void memberGetNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("운영진이 회비 계좌를 삭제하면 204 를 반환하고 이후 조회는 404 가 된다")
    void deleteThenGetNotFound() {
        upsertAs(leaderToken, accountBody("KB", "123-456-789", "예금주"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("소프트 삭제 후 같은 동아리에 회비 계좌를 다시 등록할 수 있다")
    void canReRegisterAfterSoftDelete() {
        upsertAs(leaderToken, accountBody("KB", "111-111-111", "예금주"));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        upsertAs(leaderToken, accountBody("HANA", "222-222-222", "새예금주"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.bank", equalTo("HANA"))
                .body("data.accountNumber", equalTo("222-222-222"));
    }

    @Test
    @DisplayName("30자를 초과하는 계좌번호로 등록하면 400 을 반환한다")
    void tooLongAccountNumberRejected() {
        String tooLong = "1234567890123456789012345678901"; // 31자
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(accountBody("KB", tooLong, "예금주"))
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("공백 계좌번호로 등록하면 400 을 반환한다")
    void blankAccountNumberRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(accountBody("KB", "   ", "예금주"))
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("숫자·하이픈 외 문자가 포함된 계좌번호로 등록하면 400 을 반환한다")
    void invalidCharacterAccountNumberRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(accountBody("KB", "123-ABC-456", "예금주"))
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("정의되지 않은 은행 코드로 등록하면 400 을 반환한다")
    void unknownBankRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(accountBody("INVALID_BANK", "123-456-789", "예금주"))
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("은행 코드가 누락되면 400 을 반환한다")
    void missingBankRejected() {
        Map<String, Object> body = new HashMap<>();
        body.put("accountNumber", "123-456-789");
        body.put("accountHolder", "예금주");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(body)
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }
}
