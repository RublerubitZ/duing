package com.duing.domain.clubmember;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.SuccessionStatus;
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
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class LeaderSuccessionAcceptanceTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String officerToken;
    private Long clubId;
    private Long officerUserId;
    private Long leaderUserId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        leaderUserId = leader.getId();
        officerUserId = officer.getId();
        Club club = clubRepository.save(Club.create("타깃동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubId = club.getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    @Test
    @DisplayName("OFFICER 가 승계 요청을 제출하면 201 이 반환된다")
    void createRequestSucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "잠수 3개월"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("ok", equalTo(true))
                .body("data", notNullValue());
    }

    @Test
    @DisplayName("미인증 요청은 401")
    void unauthenticatedRejected() {
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "테스트"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("STUDENT 가 /admin/leader-succession-requests 호출 시 403")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get("/api/v1/admin/leader-succession-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 이 승계 요청을 APPROVED 로 처리하면 204 + 역할이 교환된다")
    void adminApprovesSwapsRoles() {
        Long requestId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "잠수"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "APPROVED", "actionNote", "확인"))
                .when().patch("/api/v1/admin/leader-succession-requests/" + requestId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        ClubMember leaderRow = clubMemberRepository.findByClubIdAndUserId(clubId, leaderUserId).orElseThrow();
        ClubMember officerRow = clubMemberRepository.findByClubIdAndUserId(clubId, officerUserId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(leaderRow.getRole()).isEqualTo(ClubMemberRole.MEMBER);
        org.assertj.core.api.Assertions.assertThat(officerRow.getRole()).isEqualTo(ClubMemberRole.LEADER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/leader-succession-requests/" + requestId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo(SuccessionStatus.APPROVED.name()));
    }

    @Test
    @DisplayName("승계 요청 처리 시 status 가 누락되면 400 을 반환한다")
    void processSuccessionRequestWithMissingStatusReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("actionNote", "메모"))
                .when().patch("/api/v1/admin/leader-succession-requests/999999999")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동일 동아리 PENDING 승계 중복은 409")
    void duplicatePendingConflict() {
        Map<String, Object> body = Map.of("reason", "잠수");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }
}
