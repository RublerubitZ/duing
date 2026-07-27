package com.duing.domain.user.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.LoginAttemptRateLimiter;
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
import org.springframework.security.crypto.password.PasswordEncoder;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AccountSuspensionAuthTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Duing!2345";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // IP 실패 윈도우는 싱글턴 빈이라 앞선 테스트 클래스의 실패가 남아 429 로 오염될 수 있다.
        loginAttemptRateLimiter.reset();
    }

    @Test
    @DisplayName("정지된 계정으로 로그인하면 403 과 정지 안내 코드가 반환된다")
    void suspendedAccountCannotLogin() {
        User user = saveUser();
        suspend(user);

        RestAssured.given()
                .contentType("application/json")
                .body("""
                        {"studentId":"%s","password":"%s"}
                        """.formatted(user.getStudentId(), RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then()
                .statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("ACCOUNT_SUSPENDED"));
    }

    @Test
    @DisplayName("비밀번호가 틀리면 정지 여부를 알려주지 않고 일반 인증 실패로 응답한다")
    void wrongPasswordDoesNotLeakSuspension() {
        User user = saveUser();
        suspend(user);

        RestAssured.given()
                .contentType("application/json")
                .body("""
                        {"studentId":"%s","password":"WrongPass!99"}
                        """.formatted(user.getStudentId()))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("정지 이전에 발급된 액세스 토큰은 보호 API 에서 401 로 거부된다")
    void existingTokenRejectedAfterSuspension() {
        User user = saveUser();
        String token = jwtTokenProvider.createToken(
                user.getId(), user.getRole().name(), user.getTokenVersion());

        suspend(user);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/users/me")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("정지를 해제하면 다시 로그인할 수 있고 마지막 로그인 시각이 기록된다")
    void unsuspendedAccountCanLoginAgain() {
        User user = saveUser();
        suspend(user);

        User target = userRepository.findById(user.getId()).orElseThrow();
        target.unsuspend();
        userRepository.saveAndFlush(target);

        RestAssured.given()
                .contentType("application/json")
                .body("""
                        {"studentId":"%s","password":"%s"}
                        """.formatted(user.getStudentId(), RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value());

        assertThat(userRepository.findById(user.getId()).orElseThrow().getLastLoginAt()).isNotNull();
    }

    private void suspend(User user) {
        User target = userRepository.findById(user.getId()).orElseThrow();
        target.suspend();
        userRepository.saveAndFlush(target);
    }

    private User saveUser() {
        long unique = sequence.getAndIncrement();
        // 로그인 요청 DTO 가 학번을 8자리 숫자로 검증하므로 그 형식을 지킨다.
        return userRepository.saveAndFlush(User.create(
                String.format("%08d", unique % 100_000_000L),
                "정지대상",
                passwordEncoder.encode(RAW_PASSWORD),
                UserRole.STUDENT,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()));
    }
}
