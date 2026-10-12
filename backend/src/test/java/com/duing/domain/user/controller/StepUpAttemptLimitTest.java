package com.duing.domain.user.controller;

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
import io.restassured.http.ContentType;
import io.restassured.response.Response;
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
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * 현재 비밀번호 확인(step-up) 실패가 사용자 단위로 제한되는지, 그 제한이 로그인과 섞이지 않는지 검증한다(#1321 L-5).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class StepUpAttemptLimitTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Password123!";
    // StepUpAttemptRateLimiter.PER_MINUTE_LIMIT = 5 — package-private 라 직접 참조할 수 없어 수치를 옮겨 적는다.
    private static final int PER_MINUTE_STEP_UP_LIMIT = 5;

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // 로그인 IP 창은 IntegrationTestBase 가 비우지 않는다 — 앞 클래스의 실패가 이 클래스의 로그인을 막지 않게 비운다.
        loginAttemptRateLimiter.reset();
    }

    @Test
    @DisplayName("현재 비밀번호를 연달아 틀리면 다섯 번은 400, 그다음은 429 다")
    void repeatedWrongCurrentPasswordIsLimited() {
        User user = saveUserWithPassword();
        String accessToken = jwtTokenProvider.createToken(user.getId(), user.getRole().name());

        for (int attempt = 0; attempt < PER_MINUTE_STEP_UP_LIMIT; attempt++) {
            changePasswordWithWrongCurrentPassword(accessToken)
                    .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", equalTo("현재 비밀번호가 일치하지 않습니다."));
        }

        changePasswordWithWrongCurrentPassword(accessToken)
                .then()
                .statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("message", equalTo("비밀번호 확인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."));
    }

    @Test
    @DisplayName("비밀번호 확인 한도에 걸려도 로그인은 막히지 않는다")
    void stepUpLimitDoesNotLockLogin() {
        User user = saveUserWithPassword();
        String accessToken = jwtTokenProvider.createToken(user.getId(), user.getRole().name());
        for (int attempt = 0; attempt <= PER_MINUTE_STEP_UP_LIMIT; attempt++) {
            changePasswordWithWrongCurrentPassword(accessToken);
        }

        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value());
    }

    private Response changePasswordWithWrongCurrentPassword(String accessToken) {
        return RestAssured.given()
                .contentType(ContentType.JSON)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .body(Map.of("currentPassword", "Wrong9999!", "newPassword", "New5678!"))
                .when().patch("/api/v1/users/me/password");
    }

    private User saveUserWithPassword() {
        long seq = sequence.incrementAndGet();
        String studentId = String.format("%08d", seq % 100_000_000L);
        return userRepository.save(User.create(
                studentId, "U" + seq,
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
