package com.duing.domain.club;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CentralClubRecertificationAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String leaderToken;
    private Long centralClubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = clubRepository.save(Club.create("중앙동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        club.changeCentralClub(true);
        clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        centralClubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 재인증 신청은 운영 행위 게이트(Part C)로 ACTIVE 동아리만
        // 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", centralClubId);
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq, "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    @DisplayName("ADMIN 이 라운드를 열고 LEADER 가 제출 후 ADMIN 이 승인하면 lastVerifiedYear 가 갱신된다")
    void fullFlow() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", 2026, "label", "2026 정기 재인증"))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.CREATED.value());

        Long requestId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "contactEmail", "leader@example.com",
                        "contactPhone", "010-1234-5678",
                        "operatingYear", 2026,
                        "notes", "메모"))
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "APPROVED", "actionNote", "확인"))
                .when().patch("/api/v1/admin/recertification-requests/" + requestId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        Club updated = clubRepository.findById(centralClubId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(updated.getLastVerifiedYear()).isEqualTo(2026);
    }

    @Test
    @DisplayName("미인증 사용자 제출은 401")
    void unauthenticatedRejected() {
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "contactEmail", "x@example.com",
                        "contactPhone", "010-0000-0000",
                        "operatingYear", 2026))
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("STUDENT 가 /admin/recertification-rounds 호출 시 403")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 의 미인증 동아리 조회 — operatingYear 기준 EXPIRED 가 포함된다")
    void rc5ListsExpired() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", 2026, "label", "2026"))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/recertification-status?operatingYear=2026")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].clubId", equalTo(centralClubId.intValue()))
                .body("data.content[0].expired", equalTo(true));
    }

    @Test
    @DisplayName("재인증 라운드 생성 시 label 이 비어 있으면 400 을 반환한다")
    void createRoundWithBlankLabelReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", 2026, "label", ""))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("재인증 요청 처리 시 status 가 누락되면 400 을 반환한다")
    void processRecertificationRequestWithMissingStatusReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("actionNote", "메모"))
                .when().patch("/api/v1/admin/recertification-requests/999999999")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동일 round×club PENDING 중복은 409")
    void duplicatePendingConflict() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", 2026, "label", "2026"))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.CREATED.value());

        Map<String, Object> body = Map.of(
                "contactEmail", "l@example.com",
                "contactPhone", "010-1",
                "operatingYear", 2026);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }
}
