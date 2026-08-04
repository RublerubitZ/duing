package com.duing.domain.recruitment.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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
 * 모집 관리 API 의 동아리 간 격리(IDOR) 회귀 잠금.
 *
 * <p>URL 의 clubId·recruitmentId 를 남의 동아리 값으로 바꿔 실제 HTTP 로 호출해, 역할이 아무리 높아도
 * 소속이 다르면 거부되는지 확인한다. 서비스 단위 테스트(mock 으로 ClubAuthService 를 스텁)와 달리
 * 컨트롤러·시큐리티 필터·실 DB 를 모두 통과하므로 배선 누락까지 잡는다.
 *
 * <p>비-멤버 거부는 존재를 숨기기 위해 역할 부족과 같은 403 으로 수렴한다 (ClubMemberException.NotAMember).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RecruitmentManageAuthorizationTest extends IntegrationTestBase {

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

    private Club targetClub;
    private Long targetRecruitmentId;
    private String targetLeaderToken;
    private String targetPlainMemberToken;
    private String otherLeaderToken;
    private String otherOfficerToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        User targetLeader = saveStudent("대상동아리회장");
        targetLeaderToken = tokenFor(targetLeader);
        targetClub = saveActiveClub("대상동아리", targetLeader, ClubMemberRole.LEADER);

        User targetPlainMember = saveStudent("대상동아리일반회원");
        targetPlainMemberToken = tokenFor(targetPlainMember);
        clubMemberRepository.save(ClubMember.of(targetClub, targetPlainMember, ClubMemberRole.MEMBER));

        User otherLeader = saveStudent("타동아리회장");
        otherLeaderToken = tokenFor(otherLeader);
        Club otherClub = saveActiveClub("타동아리", otherLeader, ClubMemberRole.LEADER);

        User otherOfficer = saveStudent("타동아리운영진");
        otherOfficerToken = tokenFor(otherOfficer);
        clubMemberRepository.save(ClubMember.of(otherClub, otherOfficer, ClubMemberRole.OFFICER));

        targetRecruitmentId = createRecruitment(targetLeaderToken, targetClub.getId());
    }

    @Test
    @DisplayName("자기 동아리 운영진은 모집을 수정할 수 있다")
    void ownLeaderCanUpdateRecruitment() {
        updateRecruitment(targetLeaderToken, targetRecruitmentId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("이미 마감된 모집을 다시 마감하면 409 와 마감 코드로 거절된다")
    void closingAlreadyClosedRecruitmentReturnsClosedCode() {
        closeRecruitment(targetLeaderToken, targetRecruitmentId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 마감 모집 쓰기 실패는 읽기 전용 가드(RECRUITMENT_CLOSED)와 같은 코드로 나가야
        // 프론트가 마감 관련 실패를 단일 분기로 처리할 수 있다.
        closeRecruitment(targetLeaderToken, targetRecruitmentId)
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("RECRUITMENT_CLOSED"))
                .body("message", equalTo("이미 마감된 모집 공고입니다."));
    }

    @Test
    @DisplayName("타 동아리 회장이 URL 의 recruitmentId 만 바꿔 남의 모집을 수정하면 403 이다")
    void otherClubLeaderCannotUpdateRecruitment() {
        updateRecruitment(otherLeaderToken, targetRecruitmentId)
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("타 동아리 운영진(OFFICER)도 남의 모집을 마감·삭제할 수 없다")
    void otherClubOfficerCannotCloseOrDeleteRecruitment() {
        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherOfficerToken)
                .when()
                    .patch("/api/v1/leader/recruitments/{recruitmentId}/close", targetRecruitmentId)
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherOfficerToken)
                .when()
                    .delete("/api/v1/leader/recruitments/{recruitmentId}", targetRecruitmentId)
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("타 동아리 회장은 남의 모집 지원자 목록·통계를 조회할 수 없다")
    void otherClubLeaderCannotReadApplicantsOrStats() {
        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherLeaderToken)
                .when()
                    .get("/api/v1/leader/recruitments/{recruitmentId}/applications", targetRecruitmentId)
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherLeaderToken)
                .when()
                    .get("/api/v1/leader/recruitments/{recruitmentId}/stats/summary", targetRecruitmentId)
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("타 동아리 회장이 URL 의 clubId 를 남의 동아리로 바꿔 모집을 생성하면 403 이다")
    void otherClubLeaderCannotCreateRecruitmentInTargetClub() {
        LocalDate today = LocalDate.now();
        RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherLeaderToken)
                    .contentType(ContentType.JSON)
                    .body("""
                            {
                              "title": "남의 동아리에 끼워 넣는 모집",
                              "startDate": "%s",
                              "endDate": "%s",
                              "capacity": 5,
                              "questions": ["지원 동기를 알려주세요"]
                            }
                            """.formatted(today, today.plusDays(7)))
                .when()
                    .post("/api/v1/leader/clubs/{clubId}/recruitments", targetClub.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("같은 동아리의 일반 회원(MEMBER)도 모집을 수정할 수 없다")
    void plainMemberCannotUpdateRecruitment() {
        updateRecruitment(targetPlainMemberToken, targetRecruitmentId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비로그인 상태로 모집 관리 API 를 호출하면 401 이다")
    void anonymousCannotReachManageApi() {
        RestAssured.given()
                    .contentType(ContentType.JSON)
                    .body("{\"title\": \"비로그인 수정\"}")
                .when()
                    .patch("/api/v1/leader/recruitments/{recruitmentId}", targetRecruitmentId)
                .then()
                    .statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when()
                    .get("/api/v1/leader/recruitments/{recruitmentId}/stats/summary", targetRecruitmentId)
                .then()
                    .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private io.restassured.response.Response updateRecruitment(String token, Long recruitmentId) {
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body("{\"title\": \"수정된 제목\"}")
                .when()
                    .patch("/api/v1/leader/recruitments/{recruitmentId}", recruitmentId);
    }

    private io.restassured.response.Response closeRecruitment(String token, Long recruitmentId) {
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                    .patch("/api/v1/leader/recruitments/{recruitmentId}/close", recruitmentId);
    }

    private Long createRecruitment(String token, Long clubId) {
        LocalDate today = LocalDate.now();
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body("""
                            {
                              "title": "대상 동아리 모집",
                              "startDate": "%s",
                              "endDate": "%s",
                              "capacity": 10,
                              "questions": ["지원 동기를 알려주세요"]
                            }
                            """.formatted(today.minusDays(1), today.plusDays(7)))
                .when()
                    .post("/api/v1/leader/clubs/{clubId}/recruitments", clubId)
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .extract().jsonPath().getLong("data");
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
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

    private Club saveActiveClub(String name, User leader, ClubMemberRole leaderRole) {
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
        clubMemberRepository.save(ClubMember.of(savedClub, leader, leaderRole));
        return savedClub;
    }
}
