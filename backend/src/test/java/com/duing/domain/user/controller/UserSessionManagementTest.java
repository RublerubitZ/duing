package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
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
class UserSessionManagementTest extends IntegrationTestBase {

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
                String.format("%08d", unique % 100_000_000L), "세션관리테스터",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private String mobileAccessToken(User user, String deviceLabel) {
        return given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD,
                        "deviceLabel", deviceLabel, "platform", "IOS"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.accessToken");
    }

    private Response webLogin(User user) {
        return given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/web/login");
    }

    @Test
    @DisplayName("세션 목록은 현재 세션을 표시하고 최근 사용 순으로 반환한다")
    void listSessionsMarksCurrentAndOrdersByRecency() {
        User user = saveUser();
        mobileAccessToken(user, "iPhone 15");
        String currentAccessToken = mobileAccessToken(user, "iPad Air");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data[0].deviceLabel", equalTo("iPad Air"))
                .body("data[0].current", equalTo(true))
                .body("data[1].deviceLabel", equalTo("iPhone 15"))
                .body("data[1].current", equalTo(false));
    }

    @Test
    @DisplayName("다른 기기 세션을 개별 폐기하면 그 세션만 로그아웃되고 현재 세션은 유지된다")
    void revokeOtherSessionKeepsCurrentAlive() {
        User user = saveUser();
        mobileAccessToken(user, "old-phone");
        String currentAccessToken = mobileAccessToken(user, "new-phone");
        Integer otherSessionId = given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.find { it.current == false }.sessionId");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().delete("/api/v1/users/me/sessions/" + otherSessionId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].current", equalTo(true));
    }

    @Test
    @DisplayName("타인의 세션 폐기 시도는 404 로 거부되고 대상 세션은 살아있다")
    void revokeForeignSessionReturns404() {
        User victim = saveUser();
        User attacker = saveUser();
        String victimToken = mobileAccessToken(victim, "victim-phone");
        String attackerToken = mobileAccessToken(attacker, "attacker-phone");
        Integer victimSessionId = given().header(HttpHeaders.AUTHORIZATION, "Bearer " + victimToken)
                .when().get("/api/v1/users/me/sessions")
                .then().extract().path("data[0].sessionId");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + attackerToken)
                .when().delete("/api/v1/users/me/sessions/" + victimSessionId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(authSessionRepository.findById(victimSessionId.longValue()).orElseThrow().getRevokedAt())
                .isNull();
    }

    @Test
    @DisplayName("전체 로그아웃은 모든 세션을 폐기하고 tokenVersion 을 올려 기존 access 도 무효화한다")
    void logoutAllRevokesEverySessionAndBumpsTokenVersion() {
        User user = saveUser();
        mobileAccessToken(user, "phone-a");
        String currentAccessToken = mobileAccessToken(user, "phone-b");
        int tokenVersionBefore = userRepository.findById(user.getId()).orElseThrow().getTokenVersion();

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().delete("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .isEmpty();
        assertThat(userRepository.findById(user.getId()).orElseThrow().getTokenVersion())
                .isGreaterThan(tokenVersionBefore);
        // 범프로 기존 access 는 즉시 401
        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("웹(쿠키) 전체 로그아웃은 인증 쿠키 3종을 삭제한다")
    void webLogoutAllClearsAuthCookies() {
        User user = saveUser();
        Response loginResponse = webLogin(user);
        String accessCookie = loginResponse.getCookie(WebAuthCookieService.ACCESS_COOKIE_NAME);

        Response logoutAllResponse = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().delete("/api/v1/users/me/sessions");

        assertThat(logoutAllResponse.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        List<String> cookies = logoutAllResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        assertThat(cookies).allMatch(cookieHeader -> cookieHeader.contains("Max-Age=0"));
    }

    @Test
    @DisplayName("현재 세션을 개별 폐기하면 로그아웃과 동일하게 동작하고 웹이면 쿠키를 삭제한다")
    void revokingCurrentSessionActsAsLogout() {
        User user = saveUser();
        Response loginResponse = webLogin(user);
        String accessCookie = loginResponse.getCookie(WebAuthCookieService.ACCESS_COOKIE_NAME);
        Integer currentSessionId = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data[0].sessionId");

        Response revokeResponse = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().delete("/api/v1/users/me/sessions/" + currentSessionId);

        assertThat(revokeResponse.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(revokeResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE))
                .as("현재 세션 폐기 = 로그아웃 — 웹 인증 쿠키 삭제")
                .hasSize(3)
                .allMatch(cookieHeader -> cookieHeader.contains("Max-Age=0"));
    }
}
