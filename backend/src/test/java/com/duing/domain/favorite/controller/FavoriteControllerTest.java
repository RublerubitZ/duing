package com.duing.domain.favorite.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FavoriteControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User student;
    private Club activeClub;
    private String studentToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;

        student = saveStudent("테스트학생");
        activeClub = saveActiveClub("테스트찜동아리");
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("POST /api/v1/me/favorites/{clubId} 는 201 과 favoriteId 를 반환한다")
    void addFavoriteReturns201() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("ok", equalTo(true));
    }

    @Test
    @DisplayName("이미 찜한 동아리에 다시 찜하면 409 를 반환한다")
    void addDuplicateFavoriteReturns409() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.CONFLICT.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("DELETE /api/v1/me/favorites/{clubId} 는 첫 번째 호출 시 204 를 반환한다")
    void removeFavoriteFirstCallReturns204() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .delete("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("DELETE /api/v1/me/favorites/{clubId} 는 두 번째 호출도 멱등하게 204 를 반환한다")
    void removeFavoriteSecondCallIsIdempotent() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .delete("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .delete("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("GET /api/v1/me/favorites 는 200 과 찜 목록 페이지를 반환한다")
    void getMyFavoritesReturns200() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/me/favorites")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true));
    }

    @Test
    @DisplayName("GET /api/v1/me/favorites/ids 는 200 과 찜한 동아리 ID 목록을 반환한다")
    void getMyFavoriteIdsReturns200() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value());

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/me/favorites/ids")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true));
    }

    @Test
    @DisplayName("비 ACTIVE 동아리에 찜 추가를 호출하면 존재를 숨기고 404 를 반환한다")
    void addFavoriteToNonActiveClubReturns404() throws Exception {
        Club inactiveClub = saveClubWithStatus("휴면동아리", ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                    .contentType(ContentType.JSON)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", inactiveClub.getId())
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("찜한 동아리가 비 ACTIVE 로 전환되면 찜 목록·ID 목록 응답에서 제외된다")
    void nonActiveClubIsExcludedFromFavoriteListAndIds() throws Exception {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value());

        changeClubStatus(activeClub.getId(), ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/me/favorites")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.totalElements", equalTo(0))
                    .body("data.content", hasSize(0));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/me/favorites/ids")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.clubIds", hasSize(0));
    }

    @Test
    @DisplayName("동아리가 비 ACTIVE 로 전환돼도 기존 찜 해제는 204 로 동작한다")
    void removeFavoriteOfNonActiveClubReturns204() throws Exception {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.CREATED.value());

        changeClubStatus(activeClub.getId(), ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .delete("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("인증 없이 찜 추가를 호출하면 인증 오류(4xx)를 반환한다")
    void addFavoriteWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .post("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .extract().statusCode();

        // Spring Security 는 AuthenticationEntryPoint 미설정 시 403 반환 (이 프로젝트 기본값)
        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("인증 없이 찜 해제를 호출하면 인증 오류(4xx)를 반환한다")
    void removeFavoriteWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .delete("/api/v1/me/favorites/{clubId}", activeClub.getId())
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("인증 없이 찜 목록 조회를 호출하면 인증 오류(4xx)를 반환한다")
    void getMyFavoritesWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .get("/api/v1/me/favorites")
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    @Test
    @DisplayName("인증 없이 찜 ID 목록 조회를 호출하면 인증 오류(4xx)를 반환한다")
    void getMyFavoriteIdsWithoutAuthIsRejected() {
        int statusCode = RestAssured
                .given()
                .when()
                    .get("/api/v1/me/favorites/ids")
                .then()
                    .extract().statusCode();

        assertThat(statusCode).isIn(401, 403);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "ctrl" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        return saveClubWithStatus(name, ClubStatus.ACTIVE);
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        setClubStatus(club, status);
        return clubRepository.save(club);
    }

    // 상태 전이 규칙(canTransitionTo)을 우회해 테스트 시나리오에 필요한 상태를 직접 만든다.
    private void changeClubStatus(Long clubId, ClubStatus status) throws Exception {
        Club club = clubRepository.findById(clubId).orElseThrow();
        setClubStatus(club, status);
        clubRepository.save(club);
    }

    private void setClubStatus(Club club, ClubStatus status) throws Exception {
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
    }
}
