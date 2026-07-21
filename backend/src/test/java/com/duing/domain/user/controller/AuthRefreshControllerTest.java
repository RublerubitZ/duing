package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
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
class AuthRefreshControllerTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
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
                String.format("%08d", unique % 100_000_000L), "갱신테스터",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private Response webLogin(User user, boolean rememberMe) {
        return given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD,
                        "rememberMe", rememberMe))
                .when().post("/api/v1/auth/web/login");
    }

    @Test
    @DisplayName("웹 refresh 는 쿠키 3종을 재발급하고 rememberMe 지속성 모드를 유지한다")
    void webRefreshReissuesCookiesKeepingPersistenceMode() {
        User user = saveUser();
        String persistentRefreshCookie =
                webLogin(user, true).getCookie(WebAuthCookieService.REFRESH_COOKIE_NAME);

        Response refreshResponse = given()
                .cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, persistentRefreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh");

        assertThat(refreshResponse.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        List<String> cookies = refreshResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        assertThat(cookies).anyMatch(header ->
                header.startsWith(WebAuthCookieService.REFRESH_COOKIE_NAME + "=")
                        && header.contains("Max-Age=2592000"));
    }

    @Test
    @DisplayName("세션 쿠키 모드 로그인의 refresh 재발급도 Max-Age 없는 세션 쿠키를 유지한다")
    void webRefreshKeepsSessionCookieMode() {
        User user = saveUser();
        String sessionRefreshCookie =
                webLogin(user, false).getCookie(WebAuthCookieService.REFRESH_COOKIE_NAME);

        Response refreshResponse = given()
                .cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, sessionRefreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh");

        assertThat(refreshResponse.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        List<String> cookies = refreshResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        for (String cookieHeader : cookies) {
            assertThat(cookieHeader).doesNotContain("Max-Age").doesNotContain("Expires");
        }
    }

    @Test
    @DisplayName("웹 refresh 는 허용 Origin 없이는 403으로 거부되고, 같은 쿠키로 Origin 포함 재요청하면 성공한다")
    void webRefreshRequiresAllowedOrigin() {
        User user = saveUser();
        String refreshCookie = webLogin(user, true).getCookie(WebAuthCookieService.REFRESH_COOKIE_NAME);

        given().cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, refreshCookie)
                .when().post("/api/v1/auth/web/refresh")
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        // 403 은 필터가 컨트롤러 진입 전에 끊은 것 — 회전이 일어나지 않아 같은 쿠키가 여전히 유효하다.
        given().cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, refreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh")
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("refresh 쿠키가 없는 웹 refresh 는 세션 만료 401 코드를 반환한다")
    void webRefreshWithoutCookieReturnsSessionExpired() {
        given().header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("code", equalTo("AUTH_SESSION_EXPIRED"));
    }

    @Test
    @DisplayName("refresh 쿠키가 없는 웹 refresh 의 401 응답은 인증 쿠키 3종을 즉시 만료시킨다")
    void webRefreshWithoutCookieExpiresAllAuthCookies() {
        Response refreshResponse = given().header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh");

        assertThat(refreshResponse.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertExpiresAllAuthCookies(refreshResponse);
    }

    @Test
    @DisplayName("위조된 refresh 쿠키의 웹 refresh 401 응답도 인증 쿠키 3종을 즉시 만료시킨다")
    void webRefreshWithForgedCookieExpiresAllAuthCookies() {
        Response refreshResponse = given()
                .cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, "forged-refresh-token")
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh");

        assertThat(refreshResponse.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertExpiresAllAuthCookies(refreshResponse);
    }

    @Test
    @DisplayName("모바일 refresh 의 401 응답에는 Set-Cookie 가 내려가지 않는다")
    void mobileRefreshFailureDoesNotTouchCookies() {
        Response refreshResponse = given().contentType(ContentType.JSON)
                .body(Map.of("refreshToken", "forged-refresh-token"))
                .when().post("/api/v1/auth/refresh");

        assertThat(refreshResponse.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(refreshResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE)).isEmpty();
    }

    @Test
    @DisplayName("모바일 refresh 는 새 access·refresh 쌍을 바디로 반환한다")
    void mobileRefreshReturnsNewTokenPair() {
        User user = saveUser();
        String mobileRefreshToken = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.refreshToken");

        given().contentType(ContentType.JSON)
                .body(Map.of("refreshToken", mobileRefreshToken))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.accessToken", notNullValue())
                .body("data.tokenType", equalTo("Bearer"))
                .body("data.refreshToken", notNullValue());
    }

    @Test
    @DisplayName("위조된 리프레시 토큰의 모바일 refresh 는 세션 만료 401 코드를 반환한다")
    void mobileRefreshWithUnknownTokenReturnsSessionExpired() {
        given().contentType(ContentType.JSON)
                .body(Map.of("refreshToken", "forged-refresh-token"))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("code", equalTo("AUTH_SESSION_EXPIRED"));
    }

    private void assertExpiresAllAuthCookies(Response response) {
        List<String> cookieHeaders = response.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        for (String cookieName : List.of(
                WebAuthCookieService.ACCESS_COOKIE_NAME,
                WebAuthCookieService.REFRESH_COOKIE_NAME,
                WebAuthCookieService.AUTH_HINT_COOKIE_NAME)) {
            assertThat(cookieHeaders).anyMatch(header ->
                    header.startsWith(cookieName + "=") && header.contains("Max-Age=0"));
        }
    }
}
