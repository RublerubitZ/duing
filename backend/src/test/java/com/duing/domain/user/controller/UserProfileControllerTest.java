package com.duing.domain.user.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserProfileControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    private User saveUser(Grade grade) {
        long unique = sequence.getAndIncrement();
        String phone = String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000);
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "프로필테스터",
                "profile-" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                grade,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                phone,
                LocalDateTime.now()));
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
    }

    @Test
    @DisplayName("내 정보 조회 시 학년이 응답에 포함된다")
    void getMeIncludesGrade() {
        User user = saveUser(Grade.JUNIOR);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.grade", equalTo("JUNIOR"));
    }

    @Test
    @DisplayName("프로필 수정 후 내 정보를 조회하면 변경된 학년이 반환된다")
    void updateProfileChangesGrade() {
        User user = saveUser(Grade.FRESHMAN);
        String token = tokenFor(user);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body("{\"name\":\"수정이름\",\"phone\":\"010-1234-5678\",\"grade\":\"SENIOR\"}")
                .when().patch("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.grade", equalTo("SENIOR"));
    }

    @Test
    @DisplayName("프로필 수정 요청에서 학년을 누락하면 잘못된 요청으로 거부된다")
    void updateProfileWithoutGradeReturns400() {
        User user = saveUser(Grade.FRESHMAN);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .contentType(ContentType.JSON)
                .body("{\"name\":\"수정이름\",\"phone\":\"010-1234-5678\"}")
                .when().patch("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }
}
