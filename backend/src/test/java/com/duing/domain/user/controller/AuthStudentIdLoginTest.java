package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.LoginAttemptRateLimiter;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthStudentIdLoginTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";

    @LocalServerPort
    private int port;

    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        loginAttemptRateLimiter.reset();
    }

    /** 8자리 학번 사용자를 저장하고 학번을 반환한다. */
    private String saveUserWithPassword() {
        long seq = sequence.incrementAndGet();
        String studentId = String.format("%08d", seq % 100_000_000L);
        String phone = String.format("010-%04d-%04d", (seq / 10_000) % 10_000, seq % 10_000);
        userRepository.save(User.create(
                studentId, "로그인테스터", "login" + seq + "@daegu.ac.kr",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", phone, LocalDateTime.now()));
        return studentId;
    }

    @Test
    @DisplayName("학번과 비밀번호로 로그인하면 200 과 Bearer 토큰, 사용자 정보를 반환한다")
    void loginSucceedsWithStudentId() {
        String studentId = saveUserWithPassword();

        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId, "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.accessToken", notNullValue())
                .body("data.tokenType", equalTo("Bearer"))
                .body("data.user.studentId", equalTo(studentId));
    }

    @Test
    @DisplayName("존재하지 않는 학번으로 로그인하면 401 과 학번 기준 실패 메시지를 반환한다")
    void loginFailsForUnknownStudentId() {
        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", "99999999", "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("message", equalTo("학번 또는 비밀번호가 올바르지 않습니다."));
    }

    @Test
    @DisplayName("비밀번호가 틀리면 401 을 반환한다")
    void loginFailsForWrongPassword() {
        String studentId = saveUserWithPassword();

        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId, "password", "Wrong1234!"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("8자리 숫자가 아닌 학번은 400 으로 거부된다")
    void loginRejectsMalformedStudentId() {
        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", "2024001", "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }
}
