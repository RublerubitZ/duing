package com.duing.domain.report;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.report.entity.ReportStatus;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReportAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String studentToken;
    private String adminToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User student = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        clubId = clubRepository.save(Club.create("타깃동아리", ClubCategory.ACADEMIC,
                null, "설명", null)).getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "사용자" + seq, "user" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    @DisplayName("로그인한 학생이 동아리 신고를 제출하면 201과 신고 ID 가 반환된다")
    void createReportSucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "CLUB",
                        "targetId", clubId,
                        "reasonCode", "INAPPROPRIATE",
                        "detail", "부적절한 운영"))
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("ok", equalTo(true))
                .body("data", notNullValue());
    }

    @Test
    @DisplayName("미인증 사용자의 신고 제출은 401")
    void unauthenticatedReportRejected() {
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("targetType", "CLUB", "targetId", clubId,
                        "reasonCode", "SPAM"))
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("자신이 LEADER 인 동아리 신고는 400")
    void selfReportReturnsBadRequest() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = clubRepository.findById(clubId).orElseThrow();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("targetType", "CLUB", "targetId", clubId, "reasonCode", "SPAM"))
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동일 신고자 × 동일 대상 PENDING 중복은 409")
    void duplicatePendingReturnsConflict() {
        Map<String, Object> body = Map.of(
                "targetType", "CLUB", "targetId", clubId, "reasonCode", "SPAM");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("STUDENT 는 /admin/reports 에 접근할 수 없다 (403)")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/reports")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("신고 처리 시 status 가 누락되면 400 을 반환한다")
    void processReportWithMissingStatusReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("actionNote", "메모"))
                .when().patch("/api/v1/admin/reports/999999999")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("ADMIN 이 신고를 RESOLVED 로 처리하면 204")
    void adminProcessesReport() {
        Long reportId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body(Map.of("targetType", "CLUB", "targetId", clubId, "reasonCode", "SPAM"))
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "RESOLVED", "actionNote", "조치 완료"))
                .when().patch("/api/v1/admin/reports/" + reportId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/reports/" + reportId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo(ReportStatus.RESOLVED.name()))
                .body("data.handledBy.id", notNullValue());
    }
}
