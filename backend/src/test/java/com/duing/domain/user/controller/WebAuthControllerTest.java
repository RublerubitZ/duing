package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.LoginAttemptRateLimiter;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.auth.WebAuthCookieService;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebAuthControllerTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String NEW_PASSWORD = "New5678!";
    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PhoneVerificationRepository phoneVerificationRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private LoginAttemptRateLimiter loginAttemptRateLimiter;

    @Autowired
    private Clock clock;

    @Value("${jwt.secret}")
    private String jwtSecret;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        loginAttemptRateLimiter.reset();
    }

    @Test
    @DisplayName("웹 로그인은 JWT 응답 없이 사용자와 access/auth_hint Cookie를 반환한다")
    void webLoginReturnsUserWithoutJwtAndSetsBothCookies() {
        User user = saveUser(UserRole.STUDENT);

        Response response = given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/web/login");

        response.then().statusCode(HttpStatus.OK.value())
                .body("data.user.studentId", equalTo(user.getStudentId()))
                .body("data.accessToken", nullValue());
        assertIssuedCookies(response);
    }

    @Test
    @DisplayName("모바일 로그인은 Origin 없이 기존 Bearer JWT 계약을 유지한다")
    void mobileLoginStillReturnsBearerJwtWithoutOrigin() {
        User user = saveUser(UserRole.STUDENT);

        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.accessToken", notNullValue())
                .body("data.tokenType", equalTo("Bearer"))
                .body("data.user.studentId", equalTo(user.getStudentId()));
    }

    @Test
    @DisplayName("유효한 웹 Cookie 로그아웃은 멱등 204와 삭제 Cookie를 반환하고 모든 기존 토큰을 무효화한다")
    void webLogoutWithValidCookieClearsCookiesAndRevokesAllTokens() {
        User user = saveUser(UserRole.STUDENT);
        String accessToken = tokenFor(user);

        Response response = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessToken)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/logout");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertClearedCookies(response);

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("손상된 웹 Cookie 로그아웃도 예외 없이 204와 두 삭제 Cookie를 반환한다")
    void webLogoutWithInvalidCookieIsIdempotentAndClearsCookies() {
        Response response = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "not-a-jwt")
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/logout");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertClearedCookies(response);
    }

    @Test
    @DisplayName("만료된 웹 Cookie 로그아웃도 예외 없이 204와 두 삭제 Cookie를 반환한다")
    void webLogoutWithExpiredCookieIsIdempotentAndClearsCookies() {
        User user = saveUser(UserRole.STUDENT);
        String expiredToken = JWT.create()
                .withSubject(String.valueOf(user.getId()))
                .withClaim("role", user.getRole().name())
                .withClaim("tokenVersion", user.getTokenVersion())
                .withIssuedAt(new Date(System.currentTimeMillis() - 120_000))
                .withExpiresAt(new Date(System.currentTimeMillis() - 60_000))
                .sign(Algorithm.HMAC256(jwtSecret));

        Response response = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, expiredToken)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/logout");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertClearedCookies(response);
    }

    @Test
    @DisplayName("Cookie가 없는 웹 로그아웃도 204와 두 삭제 Cookie를 반환한다")
    void webLogoutWithoutCookieIsIdempotentAndClearsCookies() {
        Response response = given()
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/logout");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertClearedCookies(response);
    }

    @Test
    @DisplayName("Cookie 인증 비밀번호 변경 성공은 웹 인증 Cookie를 모두 삭제한다")
    void cookieAuthenticatedPasswordChangeClearsWebCookies() {
        User user = saveUser(UserRole.STUDENT);

        Response response = given().contentType(ContentType.JSON)
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, tokenFor(user))
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("currentPassword", RAW_PASSWORD, "newPassword", NEW_PASSWORD))
                .when().patch("/api/v1/users/me/password");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertClearedCookies(response);
    }

    @Test
    @DisplayName("Bearer 인증 비밀번호 변경 성공은 Cookie를 변경하지 않는다")
    void bearerAuthenticatedPasswordChangeDoesNotMutateCookies() {
        User user = saveUser(UserRole.STUDENT);

        Response response = given().contentType(ContentType.JSON)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .body(Map.of("currentPassword", RAW_PASSWORD, "newPassword", NEW_PASSWORD))
                .when().patch("/api/v1/users/me/password");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(setCookieHeaders(response)).isEmpty();
    }

    @Test
    @DisplayName("Cookie 인증 전화번호 변경 성공은 웹 인증 Cookie를 모두 삭제한다")
    void cookieAuthenticatedPhoneChangeClearsWebCookies() {
        User user = saveUser(UserRole.STUDENT);
        String verificationToken = saveVerifiedPhoneChange(user);

        Response response = given().contentType(ContentType.JSON)
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, tokenFor(user))
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("currentPassword", RAW_PASSWORD, "verificationToken", verificationToken))
                .when().patch("/api/v1/users/me/phone");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertClearedCookies(response);
    }

    @Test
    @DisplayName("Bearer 인증 전화번호 변경 성공은 Cookie를 변경하지 않는다")
    void bearerAuthenticatedPhoneChangeDoesNotMutateCookies() {
        User user = saveUser(UserRole.STUDENT);
        String verificationToken = saveVerifiedPhoneChange(user);

        Response response = given().contentType(ContentType.JSON)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .body(Map.of("currentPassword", RAW_PASSWORD, "verificationToken", verificationToken))
                .when().patch("/api/v1/users/me/phone");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(setCookieHeaders(response)).isEmpty();
    }

    @Test
    @DisplayName("Cookie 인증 회원 탈퇴 성공은 웹 인증 Cookie를 모두 삭제한다")
    void cookieAuthenticatedWithdrawalClearsWebCookies() {
        User user = saveUser(UserRole.STUDENT);

        Response response = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, tokenFor(user))
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().delete("/api/v1/users/me");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertClearedCookies(response);
    }

    @Test
    @DisplayName("Bearer 인증 회원 탈퇴 성공은 Cookie를 변경하지 않는다")
    void bearerAuthenticatedWithdrawalDoesNotMutateCookies() {
        User user = saveUser(UserRole.STUDENT);

        Response response = given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().delete("/api/v1/users/me");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(setCookieHeaders(response)).isEmpty();
    }

    @ParameterizedTest(name = "GET {0} 은 상태를 변경하지 않고 405를 반환한다")
    @ValueSource(strings = {
            "/api/v1/auth/logout",
            "/api/v1/auth/web/logout",
            "/api/v1/users/me/password",
            "/api/v1/users/me/phone",
            "/api/v1/recruitments/1/applications",
            "/api/v1/leader/clubs/1/fee-policies/1",
            "/api/v1/admin/users/1/force-logout"
    })
    @DisplayName("인증·사용자·지원·회비·관리자 상태 변경 경로는 GET을 허용하지 않는다")
    void stateChangingRoutesRejectGet(String path) {
        User admin = saveUser(UserRole.ADMIN);

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(admin))
                .when().get(path)
                .then().statusCode(HttpStatus.METHOD_NOT_ALLOWED.value());
    }

    private User saveUser(UserRole role) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%08d", unique % 100_000_000L),
                "웹인증테스터",
                passwordEncoder.encode(RAW_PASSWORD),
                role,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private String saveVerifiedPhoneChange(User user) {
        LocalDateTime now = LocalDateTime.now(clock);
        String verificationToken = UUID.randomUUID().toString();
        String newPhone = String.format("010-8%03d-%04d", sequence.incrementAndGet() % 1_000,
                sequence.incrementAndGet() % 10_000);
        PhoneVerification verification = PhoneVerification.issue(
                newPhone, verificationToken, VerificationPurpose.PHONE_CHANGE, user.getId(), now);
        verification.markVerified(now);
        phoneVerificationRepository.save(verification);
        return verificationToken;
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
    }

    private void assertIssuedCookies(Response response) {
        List<String> cookies = setCookieHeaders(response);
        assertThat(cookies).hasSize(3);
        assertThat(cookieHeader(cookies, WebAuthCookieService.ACCESS_COOKIE_NAME))
                .contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/")
                .doesNotContain("Max-Age");
        assertThat(cookieHeader(cookies, WebAuthCookieService.REFRESH_COOKIE_NAME))
                .contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/api/v1/auth")
                .doesNotContain("Max-Age");
        assertThat(cookieHeader(cookies, WebAuthCookieService.AUTH_HINT_COOKIE_NAME))
                .contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/")
                .doesNotContain("Max-Age");
    }

    private void assertClearedCookies(Response response) {
        List<String> cookies = setCookieHeaders(response);
        assertThat(cookies).hasSize(3);
        assertThat(cookieHeader(cookies, WebAuthCookieService.ACCESS_COOKIE_NAME)).contains("Max-Age=0");
        assertThat(cookieHeader(cookies, WebAuthCookieService.REFRESH_COOKIE_NAME)).contains("Max-Age=0");
        assertThat(cookieHeader(cookies, WebAuthCookieService.AUTH_HINT_COOKIE_NAME)).contains("Max-Age=0");
    }

    private String cookieHeader(List<String> cookies, String cookieName) {
        return cookies.stream()
                .filter(cookie -> cookie.startsWith(cookieName + "="))
                .findFirst()
                .orElseThrow(() -> new AssertionError(cookieName + " Set-Cookie header가 없습니다."));
    }

    private List<String> setCookieHeaders(Response response) {
        return response.getHeaders().getValues(HttpHeaders.SET_COOKIE);
    }
}
