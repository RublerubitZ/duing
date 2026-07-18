package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.SessionRevokeReason;
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
class AuthLogoutSessionTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String NEW_PASSWORD = "New5678!";
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

    private User saveUser(UserRole role) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%08d", unique % 100_000_000L), "로그아웃테스터",
                passwordEncoder.encode(RAW_PASSWORD), role, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private Response webLogin(User user) {
        return given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/web/login");
    }

    @Test
    @DisplayName("웹 로그아웃은 현재 세션만 폐기하고 다른 기기 세션과 tokenVersion 은 건드리지 않는다")
    void webLogoutRevokesOnlyCurrentSession() {
        User user = saveUser(UserRole.STUDENT);
        int tokenVersionBefore = user.getTokenVersion();
        webLogin(user); // 다른 기기 세션
        Response currentLogin = webLogin(user);
        String accessCookie = currentLogin.getCookie(WebAuthCookieService.ACCESS_COOKIE_NAME);
        String refreshCookie = currentLogin.getCookie(WebAuthCookieService.REFRESH_COOKIE_NAME);

        given().cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, refreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/logout")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .as("다른 기기 세션은 살아있어야 한다").hasSize(1);
        assertThat(userRepository.findById(user.getId()).orElseThrow().getTokenVersion())
                .as("현재 기기 로그아웃은 tokenVersion 을 올리지 않는다 (spec §13.2)")
                .isEqualTo(tokenVersionBefore);
        // 폐기된 refresh 로의 갱신은 즉시 거부된다
        given().cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, refreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("Bearer 로그아웃은 access 토큰의 sid 로 현재 세션을 특정해 폐기한다")
    void bearerLogoutRevokesSessionViaSidClaim() {
        User user = saveUser(UserRole.STUDENT);
        String accessToken = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.accessToken");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.OK.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .isEmpty();
        assertThat(authSessionRepository.findAll())
                .filteredOn(session -> session.getUserId().equals(user.getId()))
                .singleElement()
                .satisfies(session ->
                        assertThat(session.getRevokeReason()).isEqualTo(SessionRevokeReason.LOGOUT));
    }

    @Test
    @DisplayName("비밀번호 변경은 그 사용자의 모든 세션을 자격 변경 사유로 폐기한다")
    void passwordChangeRevokesAllSessions() {
        User user = saveUser(UserRole.STUDENT);
        webLogin(user);
        Response currentLogin = webLogin(user);
        String accessCookie = currentLogin.getCookie(WebAuthCookieService.ACCESS_COOKIE_NAME);

        given().contentType(ContentType.JSON)
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("currentPassword", RAW_PASSWORD, "newPassword", NEW_PASSWORD))
                .when().patch("/api/v1/users/me/password")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .isEmpty();
        assertThat(authSessionRepository.findAll())
                .filteredOn(session -> session.getUserId().equals(user.getId()))
                .allSatisfy(session ->
                        assertThat(session.getRevokeReason()).isEqualTo(SessionRevokeReason.CREDENTIAL_CHANGE));
    }

    @Test
    @DisplayName("관리자 강제 로그아웃은 대상 사용자의 모든 세션을 폐기하고 tokenVersion 도 올린다")
    void adminForceLogoutRevokesAllSessionsAndBumpsTokenVersion() {
        User admin = saveUser(UserRole.ADMIN);
        User target = saveUser(UserRole.STUDENT);
        webLogin(target);
        int tokenVersionBefore = target.getTokenVersion();
        String adminAccessToken = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", admin.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.accessToken");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminAccessToken)
                .when().post("/api/v1/admin/users/" + target.getId() + "/force-logout")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(target.getId()))
                .isEmpty();
        assertThat(userRepository.findById(target.getId()).orElseThrow().getTokenVersion())
                .isGreaterThan(tokenVersionBefore);
    }
}
