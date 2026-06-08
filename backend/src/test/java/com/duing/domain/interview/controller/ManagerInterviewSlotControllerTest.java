package com.duing.domain.interview.controller;

import static org.hamcrest.Matchers.hasSize;
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
import java.util.List;
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
class ManagerInterviewSlotControllerTest extends IntegrationTestBase {

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

        Club club = clubRepository.save(Club.create("슬롯테스트동아리", ClubCategory.ACADEMIC, null, "설명", null));

        User leader = saveUser();
        User outsider = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "테스트 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        recruitmentId = recruitment.getId();

        configRepository.save(InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(7)));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
    }

    @Test
    @DisplayName("운영진이 슬롯을 bulk 생성하면 201 과 slotIds 를 반환한다")
    void createBulkHappyPath() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3),
                        Map.of("startTime", base.plusHours(2).toString(), "endTime", base.plusHours(3).toString(), "capacity", 2)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.slotIds", hasSize(2));
    }

    @Test
    @DisplayName("동아리 비회원이 슬롯을 생성하면 403 을 반환한다")
    void createBulkReturns403ForNonMember() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("InterviewConfig 가 없는 모집에 슬롯을 생성하면 404 를 반환한다")
    void createBulkReturns404WhenNoConfig() {
        // 새 모집 — config 없음
        Club club = clubRepository.save(Club.create("다른동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment newRecruitment = recruitmentRepository.save(
                Recruitment.create(club, "config 없는 모집", "내용",
                        LocalDate.now().plusDays(1), LocalDate.now().plusDays(30), 10));
        String newLeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + newLeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + newRecruitment.getId() + "/interview-slots")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("모집이 이미 시작된 경우 슬롯 생성은 409 를 반환한다")
    void createBulkReturns409WhenRecruitmentAlreadyStarted() {
        // 모집 시작일이 어제인 별도 모집
        Club club = clubRepository.save(Club.create("시작된동아리", ClubCategory.ACADEMIC, null, "설명", null));
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment startedRecruitment = recruitmentRepository.save(
                Recruitment.create(club, "시작된 모집", "내용",
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(30), 10));
        configRepository.save(InterviewConfig.create(startedRecruitment.getId(), LocalDateTime.now().plusDays(7)));
        String startedLeaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + startedLeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + startedRecruitment.getId() + "/interview-slots")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("capacity 가 0 이하이면 슬롯 생성은 400 을 반환한다")
    void createBulkReturns400WhenCapacityIsZero() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 0)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("endTime 이 startTime 이전이면 슬롯 생성은 400 을 반환한다")
    void createBulkReturns400WhenEndTimeBeforeStartTime() {
        LocalDateTime base = LocalDateTime.now().plusDays(5);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.minusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("운영진이 슬롯 목록을 조회하면 200 과 슬롯 목록을 반환한다")
    void listSlotsHappyPath() {
        // 먼저 슬롯 생성
        LocalDateTime base = LocalDateTime.now().plusDays(5);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("slots", List.of(
                        Map.of("startTime", base.toString(), "endTime", base.plusHours(1).toString(), "capacity", 3)
                )))
                .when().post("/api/v1/recruitments/" + recruitmentId + "/interview-slots");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/recruitments/" + recruitmentId + "/interview-slots")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1));
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
