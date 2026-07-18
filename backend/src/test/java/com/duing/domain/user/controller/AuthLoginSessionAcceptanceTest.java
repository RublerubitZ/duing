package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.LoginAttemptRateLimiter;
import com.duing.global.auth.WebAuthCookieService;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
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
import org.springframework.security.crypto.password.PasswordEncoder;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthLoginSessionAcceptanceTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        loginAttemptRateLimiter.reset();
    }

    private User saveUser() {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%08d", unique % 100_000_000L), "세션테스터",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    @Test
    @DisplayName("모바일 로그인 응답은 리프레시 토큰을 포함하고 기기 라벨·플랫폼이 세션에 저장된다")
    void mobileLoginReturnsRefreshTokenAndStoresDeviceMetadata() {
        User user = saveUser();

        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD,
                        "deviceLabel", "iPhone 15 Pro", "platform", "IOS"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.accessToken", notNullValue())
                .body("data.refreshToken", notNullValue())
                .body("data.tokenType", equalTo("Bearer"));

        var sessions = authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId());
        assertThat(sessions).hasSize(1);
        assertThat(sessions.get(0).getPlatform()).isEqualTo(SessionPlatform.IOS);
        assertThat(sessions.get(0).getDeviceLabel()).isEqualTo("iPhone 15 Pro");
    }

    @Test
    @DisplayName("rememberMe 로그인은 3종 Persistent Cookie(access 30분·refresh/hint 30일)를 발급한다")
    void rememberMeLoginIssuesPersistentCookies() {
        User user = saveUser();

        Response response = given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD, "rememberMe", true))
                .when().post("/api/v1/auth/web/login");

        response.then().statusCode(HttpStatus.OK.value());
        List<String> cookies = response.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        assertThat(cookieOf(cookies, WebAuthCookieService.ACCESS_COOKIE_NAME)).contains("Max-Age=1800");
        assertThat(cookieOf(cookies, WebAuthCookieService.REFRESH_COOKIE_NAME))
                .contains("Max-Age=2592000", "Path=/api/v1/auth");
        assertThat(cookieOf(cookies, WebAuthCookieService.AUTH_HINT_COOKIE_NAME)).contains("Max-Age=2592000");
    }

    @Test
    @DisplayName("rememberMe 미지정(기본) 로그인은 Max-Age 없는 세션 쿠키 3종을 발급한다")
    void defaultLoginIssuesSessionCookies() {
        User user = saveUser();

        Response response = given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/web/login");

        response.then().statusCode(HttpStatus.OK.value());
        List<String> cookies = response.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        for (String cookieHeader : cookies) {
            assertThat(cookieHeader).doesNotContain("Max-Age").doesNotContain("Expires");
            assertThat(cookieHeader).contains("HttpOnly", "Secure", "SameSite=Lax");
        }
        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .singleElement()
                .satisfies(session -> assertThat(session.isRememberMe()).isFalse());
    }

    private String cookieOf(List<String> cookies, String cookieName) {
        return cookies.stream().filter(header -> header.startsWith(cookieName + "="))
                .findFirst().orElseThrow(() -> new AssertionError(cookieName + " Set-Cookie 헤더가 없습니다."));
    }
}
