package com.duing.domain.user.controller;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
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
class AdminForceLogoutControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        adminToken = tokenFor(adminUser);
        studentToken = tokenFor(saveUser("일반학생", UserRole.STUDENT));
    }

    @Test
    @DisplayName("ADMIN 이 사용자를 강제 로그아웃하면 204 가 반환되고, 그 사용자의 기존 토큰은 401 로 거부된다")
    void adminForceLogoutRevokesTargetToken() {
        User target = saveUser("강제로그아웃대상", UserRole.STUDENT);
        String targetToken = tokenFor(target);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post("/api/v1/admin/users/{userId}/force-logout", target.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 강제 로그아웃 이전에 발급된 대상의 토큰은 만료 전이라도 token_version 불일치로 거부된다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + targetToken)
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("ADMIN 이 자기 자신을 강제 로그아웃해도 204 가 반환되고 자신의 기존 토큰도 무효화된다")
    void adminCanForceLogoutSelf() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post("/api/v1/admin/users/{userId}/force-logout", adminUser.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("STUDENT 가 강제 로그아웃을 호출하면 403 을 반환한다")
    void studentGetsForbidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().post("/api/v1/admin/users/{userId}/force-logout", adminUser.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 토큰 없이 강제 로그아웃을 호출하면 401 을 반환한다")
    void missingTokenReturnsUnauthorized() {
        RestAssured.given()
                .when().post("/api/v1/admin/users/{userId}/force-logout", adminUser.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("존재하지 않는 userId 로 강제 로그아웃을 호출하면 404 를 반환한다")
    void unknownUserReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post("/api/v1/admin/users/{userId}/force-logout", 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "force-logout-" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "미설정",
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()));
    }
}
