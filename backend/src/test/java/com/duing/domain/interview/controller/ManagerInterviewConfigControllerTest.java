package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
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
class ManagerInterviewConfigControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String leaderToken;
    private String outsiderToken;
    private Long recruitmentId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        Club club = clubRepository.save(Club.create("테스트동아리", ClubCategory.ACADEMIC, null, "설명", null));

        User leader = saveUser();
        User outsider = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "테스트 모집", "내용",
                        LocalDate.now(), LocalDate.now().plusDays(30), 10));
        recruitmentId = recruitment.getId();

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
    }

    @Test
    @DisplayName("운영진이 면접 설정을 생성하면 201 과 configId 를 반환한다")
    void createHappyPath() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", LocalDateTime.now().plusDays(5).toString()))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.configId", notNullValue());
    }

    @Test
    @DisplayName("동아리 비회원이 면접 설정을 생성하면 403 을 반환한다")
    void createReturns403ForNonMember() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", LocalDateTime.now().plusDays(5).toString()))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("이미 면접 설정이 존재하는 모집에 생성을 재시도하면 409 를 반환한다")
    void createReturns409WhenAlreadyExists() {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(5)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", LocalDateTime.now().plusDays(6).toString()))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("마감 시각이 과거이면 400 을 반환한다")
    void createReturns400WhenDeadlineIsPast() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", LocalDateTime.now().minusDays(1).toString()))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("운영진이 면접 설정을 수정하면 204 를 반환한다")
    void updateHappyPath() {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(5)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", LocalDateTime.now().plusDays(10).toString()))
                .when().patch("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("면접 설정이 없는 모집에 수정을 시도하면 404 를 반환한다")
    void updateReturns404WhenConfigNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("availabilityDeadline", LocalDateTime.now().plusDays(5).toString()))
                .when().patch("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("운영진이 GET interview-config 호출 시 200 + configId/deadline/location 이 반환된다")
    void getInterviewConfigReturnsOk() {
        configRepository.save(InterviewConfig.create(
                recruitmentId, LocalDateTime.now().plusDays(5), "공학관 2201호"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.configId", notNullValue())
                .body("data.location", equalTo("공학관 2201호"))
                .body("data.availabilityDeadline", notNullValue());
    }

    @Test
    @DisplayName("config 가 없는 모집에 GET 호출 시 404 InterviewConfigNotFound 가 반환된다")
    void getInterviewConfigReturns404WhenAbsent() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("운영진이 아닌 사용자가 GET 호출 시 403 이 반환된다")
    void getInterviewConfigReturns403ForOutsider() {
        configRepository.save(InterviewConfig.create(
                recruitmentId, LocalDateTime.now().plusDays(5), "공학관 2201호"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("create 시 location 이 200자 초과면 400 이 반환된다")
    void createRejectsTooLongLocation() {
        String tooLong = "x".repeat(201);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "availabilityDeadline", LocalDateTime.now().plusDays(5).toString(),
                        "location", tooLong))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-config")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "유저" + seq, "u" + seq + "@duing.ac.kr",
                "hash", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now()));
    }
}
