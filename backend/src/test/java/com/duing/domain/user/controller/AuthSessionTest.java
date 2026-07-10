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
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 인증 세션 강화(토큰 폐기·탈퇴 계정 차단) 검증. 인증이 필요한 엔드포인트로 로그아웃(POST /auth/logout)을
 * 사용한다 — 자기 자신의 token_version 을 올려, 같은 토큰의 후속 요청이 거부되는지 한 흐름으로 확인 가능.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthSessionTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    private User saveUser() {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "세션테스터",
                "hashed",
                UserRole.STUDENT,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
    }

    @Test
    @DisplayName("유효한 토큰의 인증 요청은 200 으로 통과한다")
    void validTokenPasses() {
        User user = saveUser();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("로그아웃하면 token_version 이 증가해 같은 토큰의 후속 요청은 만료 전이라도 401 이 된다")
    void logoutRevokesToken() {
        User user = saveUser();
        String token = tokenFor(user);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.OK.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("soft-deleted(탈퇴) 사용자의 토큰은 만료 전이라도 401 로 거부된다")
    void softDeletedUserTokenRejected() {
        User user = saveUser();
        String token = tokenFor(user);

        jdbcTemplate.update("UPDATE users SET deleted_at = NOW() WHERE id = ?", user.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}
