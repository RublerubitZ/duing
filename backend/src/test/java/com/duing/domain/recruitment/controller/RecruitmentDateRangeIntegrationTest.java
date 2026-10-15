package com.duing.domain.recruitment.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
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
import io.restassured.response.ValidatableResponse;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

/**
 * 모집 날짜 허용 범위(2000-01-01 ~ 2100-12-31)의 HTTP 계약.
 * 엔티티 불변식에서 던진 범위 예외가 컨트롤러·예외 핸들러를 거쳐 400 과 안내 문구로 나가는지 확인한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RecruitmentDateRangeIntegrationTest extends IntegrationTestBase {

    private static final String SELF_FORM_QUESTIONS =
            "[{\"text\": \"지원 동기를 알려주세요\", \"type\": \"TEXT\", \"required\": true}]";

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private ClubMemberRepository clubMemberRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leader;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveStudent("날짜범위리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
    }

    @Test
    @DisplayName("시작일이 2100-12-31 보다 늦은 모집을 만들면 400 과 허용 범위 안내를 받는다")
    void rejectsCreateOutsideAllowedRange() {
        Club club = saveActiveClubLedByLeader("범위밖생성동아리");

        postRecruitment(club, """
                {
                  "title": "범위 밖 모집",
                  "startDate": "2101-01-01",
                  "endDate": "2101-01-10",
                  "capacity": 10,
                  "questionItems": %s
                }
                """.formatted(SELF_FORM_QUESTIONS))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", containsString("2000-01-01"));
    }

    @Test
    @DisplayName("허용 범위를 크게 벗어난 연도(0001년 시작, +5874897년 종료)로 모집을 만들어도 400 과 허용 범위 안내를 받는다")
    void rejectsFarOutOfRangeYearsOnCreate() {
        Club club = saveActiveClubLedByLeader("먼연도동아리");

        postRecruitment(club, """
                {
                  "title": "먼 연도 모집",
                  "startDate": "0001-01-01",
                  "endDate": "+5874897-12-31",
                  "capacity": 10,
                  "questionItems": %s
                }
                """.formatted(SELF_FORM_QUESTIONS))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", containsString("2000-01-01"));
    }

    @Test
    @DisplayName("종료일을 2100-12-31 보다 늦게 바꾸면 400 과 허용 범위 안내를 받는다")
    void rejectsUpdateOutsideAllowedRange() {
        Club club = saveActiveClubLedByLeader("범위밖수정동아리");
        LocalDate today = LocalDate.now();
        long recruitmentId = postRecruitment(club, """
                {
                  "title": "정상 모집",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "questionItems": %s
                }
                """.formatted(today, today.plusDays(7), SELF_FORM_QUESTIONS))
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body("{\"endDate\": \"2101-01-01\"}")
                .when()
                    .patch("/api/v1/leader/recruitments/{recruitmentId}", recruitmentId)
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false))
                    .body("message", containsString("2000-01-01"));
    }

    private ValidatableResponse postRecruitment(Club club, String requestBody) {
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(requestBody)
                .when()
                    .post("/api/v1/leader/clubs/{clubId}/recruitments", club.getId())
                .then();
    }

    private User saveStudent(String name) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClubLedByLeader(String name) {
        String uniqueName = name + "-" + sequence.incrementAndGet();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        Club savedClub = clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(savedClub, leader));
        return savedClub;
    }
}
