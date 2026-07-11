package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.domain.user.service.PhoneVerificationRateLimiter;
import com.duing.global.mo.StubMoVerificationClient;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthPasswordResetTest extends IntegrationTestBase {

    private static final String ORIGINAL_PASSWORD = "Abcd1234!";

    @LocalServerPort
    private int port;

    @Autowired
    private StubMoVerificationClient stubMoClient;

    @Autowired
    private PhoneVerificationRateLimiter rateLimiter;

    @Autowired
    private MoPollThrottle moPollThrottle;

    @Autowired
    private PhoneVerificationRepository phoneVerificationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // MO 세션 시각은 서버(seoulClock)와 같은 기준으로 시드해야 한다 — raw now() 는 CI(UTC JVM)에서 +9h 어긋난다.
    @Autowired
    private Clock clock;

    // 가입 사용자·발급 번호 유일성 보장용 시퀀스.
    private final AtomicLong sequence = new AtomicLong(0);

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // @SpringBootTest 컨텍스트 공유로 in-memory 상태가 누적되므로 테스트마다 초기화한다.
        rateLimiter.reset();
        moPollThrottle.reset();
        stubMoClient.clear();
    }

    @Test
    @DisplayName("가입된 학번으로 재설정을 시작하면 등록 번호로 세션이 발급되고 마스킹된 번호를 안내한다")
    void startPasswordResetIssuesSessionForRegisteredPhone() {
        String phone = uniquePhone();
        String studentId = uniqueStudentId();
        signupUser(phone, studentId); // 가입만 — 로그인 불필요

        JsonPath body = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().jsonPath();

        assertThat(body.getString("data.maskedPhone")).isEqualTo("010-****-" + phone.substring(9));
        String token = body.getString("data.verificationToken");
        PhoneVerification session = phoneVerificationRepository.findByToken(token).orElseThrow();
        assertThat(session.getPurpose()).isEqualTo(VerificationPurpose.PASSWORD_RESET);
        assertThat(session.getPhone()).isEqualTo(phone);
        assertThat(session.getTargetUserId())
                .isEqualTo(userRepository.findByStudentId(studentId).orElseThrow().getId());
    }

    @Test
    @DisplayName("가입되지 않은 학번으로 재설정을 시작하면 사유를 특정하지 않는 400 을 반환한다")
    void startPasswordResetWithUnknownStudentIdReturns400() {
        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", "99999999"))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("PASSWORD_RESET_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("같은 학번의 재설정 시작은 시간당 3회로 제한된다")
    void startPasswordResetIsRateLimitedPerStudentId() {
        String studentId = uniqueStudentId();
        String registeredPhone = uniquePhone();
        signupUser(registeredPhone, studentId);
        // 60초 쿨다운(번호당 1행) 회피 — 시드된 그 번호의 세션 행만 과거로 되돌린다(다른 테스트 행 오염 방지).
        for (int attempt = 0; attempt < 3; attempt++) {
            given().contentType(ContentType.JSON).body(Map.of("studentId", studentId))
                    .when().post("/api/v1/auth/password-resets")
                    .then().statusCode(HttpStatus.ACCEPTED.value());
            jdbcTemplate.update(
                    "UPDATE phone_verifications SET last_issued_at = last_issued_at - INTERVAL '2 minutes' "
                            + "WHERE phone = ?", registeredPhone);
        }
        given().contentType(ContentType.JSON).body(Map.of("studentId", studentId))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("탈퇴한 학번으로 재설정을 시작하면 400 을 반환한다")
    void startPasswordResetForWithdrawnUserReturns400() {
        String studentId = uniqueStudentId();
        signupUser(uniquePhone(), studentId);
        jdbcTemplate.update("UPDATE users SET deleted_at = now() WHERE student_id = ?", studentId);

        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("PASSWORD_RESET_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("같은 IP 로 미가입 학번 재설정을 반복하면 계정 존재 여부와 무관하게 IP 분당 한도(10회)에서 429 로 막힌다")
    void startPasswordResetIsIpRateLimitedEvenOnUnknownStudentId() {
        // 매 요청 학번이 서로 달라 학번당 3회 제한엔 걸리지 않는다 — IP 발급 축만 격리 검증한다.
        // 발급 IP 분당 한도(10)는 서비스 package-private 상수라 형제 테스트처럼 리터럴로 맞춘다.
        for (int attempt = 0; attempt < 10; attempt++) {
            given().contentType(ContentType.JSON).body(Map.of("studentId", uniqueStudentId()))
                    .when().post("/api/v1/auth/password-resets")
                    .then().statusCode(HttpStatus.BAD_REQUEST.value());
        }
        given().contentType(ContentType.JSON).body(Map.of("studentId", uniqueStudentId()))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("학번 형식이 8자리 숫자가 아니면 400 을 반환한다")
    void invalidStudentIdFormatReturnsBadRequest() {
        given().contentType(ContentType.JSON).body(Map.of("studentId", "2024"))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("인증된 세션으로 재설정하면 새 비밀번호로 로그인되고 기존 토큰은 전부 무효화된다")
    void completePasswordResetChangesPasswordAndInvalidatesTokens() {
        String phone = uniquePhone();
        String studentId = uniqueStudentId();
        signupUser(phone, studentId);
        String oldAccessToken = login(studentId, ORIGINAL_PASSWORD);
        String token = issueAndVerifyResetSession(studentId);

        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 새 비밀번호로 로그인 성공 + 세션 소비 + tokenVersion bump 로 구 토큰 401 (전 기기 로그아웃)
        login(studentId, "newPass123!");
        assertThat(phoneVerificationRepository.findByToken(token)).isEmpty();
        given().header("Authorization", "Bearer " + oldAccessToken)
                .when().get("/api/v1/users/me")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("문자 인증 전의 세션으로 재설정을 완료하려 하면 403 을 반환한다")
    void completePasswordResetWithPendingSessionReturns403() {
        String studentId = uniqueStudentId();
        signupUser(uniquePhone(), studentId);
        // 시작만 하고(PENDING) 인증 없이 완료 시도
        String token = given().contentType(ContentType.JSON).body(Map.of("studentId", studentId))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().jsonPath().getString("data.verificationToken");

        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("가입용 세션으로는 비밀번호를 재설정할 수 없다")
    void completePasswordResetWithSignupSessionReturns403() {
        String token = issueAndVerifySignupSession(uniquePhone()); // purpose=SIGNUP
        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("인증 후 완료 창(10분)이 지난 세션으로 재설정하면 403 을 반환한다")
    void completePasswordResetAfterCompletionWindowReturns403() {
        String studentId = uniqueStudentId();
        signupUser(uniquePhone(), studentId);
        String token = issueAndVerifyResetSession(studentId);
        jdbcTemplate.update(
                "UPDATE phone_verifications SET verified_at = verified_at - INTERVAL '11 minutes' WHERE token = ?",
                token);

        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증과 완료 사이에 계정이 탈퇴되면 400 을 반환한다")
    void completePasswordResetForWithdrawnUserReturns400() {
        String studentId = uniqueStudentId();
        signupUser(uniquePhone(), studentId);
        String token = issueAndVerifyResetSession(studentId);
        jdbcTemplate.update("UPDATE users SET deleted_at = now() WHERE student_id = ?", studentId);

        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("PASSWORD_RESET_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("형식에 맞지 않는 새 비밀번호는 400 검증 오류를 반환한다")
    void completePasswordResetWithWeakPasswordReturns400() {
        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", "any-token", "newPassword", "short"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    /**
     * 인증 완료 SIGNUP 세션 시드 → 가입까지만 마친다(로그인 불필요). 세션 시드는 UserPhoneChangeTest 의
     * signupAndLogin 패턴, 가입은 실제 API 경유 — 가입 시 SIGNUP 세션은 소비(삭제)된다.
     */
    private void signupUser(String phone, String studentId) {
        LocalDateTime seededAt = LocalDateTime.now(clock);
        PhoneVerification verifiedSession = PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, seededAt);
        verifiedSession.markVerified(seededAt);
        String verificationToken = phoneVerificationRepository.save(verifiedSession).getToken();

        given().contentType(ContentType.JSON)
                .body(Map.of(
                        "studentId", studentId,
                        "name", "재설정대상",
                        "password", ORIGINAL_PASSWORD,
                        "grade", "JUNIOR",
                        "college", "IT_ENGINEERING",
                        "major", "컴퓨터정보공학부",
                        "verificationToken", verificationToken,
                        "termsOfServiceAgreed", true,
                        "privacyPolicyAgreed", true))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    /** 로그인(또는 재로그인) — 액세스 토큰을 돌려준다. 재설정 후 새 비밀번호 로그인 성공 검증에 재사용한다. */
    private String login(String studentId, String password) {
        return given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId, "password", password))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getString("data.accessToken");
    }

    /**
     * 학번으로 PASSWORD_RESET 세션을 발급(등록된 번호로)하고 스텁 문자 수신→상태 조회 폴링으로 VERIFIED 까지
     * 끌어올린 뒤, 완료 API 에 넣을 verificationToken 을 돌려준다. 발급 응답엔 마스킹된 번호만 오므로
     * 스텁 등록에 쓸 전체 번호는 세션 행에서 읽는다.
     */
    private String issueAndVerifyResetSession(String studentId) {
        JsonPath issueBody = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().jsonPath();
        String token = issueBody.getString("data.verificationToken");
        String registeredPhone = phoneVerificationRepository.findByToken(token).orElseThrow().getPhone();
        return verifyIssuedSession(registeredPhone, token, issueBody.getString("data.code"));
    }

    /** 공개(SIGNUP) 발급 세션을 인증까지 끌어올린다 — 완료 API 의 용도 불일치(403) 검증용. */
    private String issueAndVerifySignupSession(String phone) {
        JsonPath issueBody = given().contentType(ContentType.JSON)
                .body(Map.of("phone", phone))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath();
        return verifyIssuedSession(phone, issueBody.getString("data.verificationToken"),
                issueBody.getString("data.code"));
    }

    /** 스텁에 코드 수신을 등록하고 상태 조회 폴링으로 세션을 VERIFIED 로 확정한다(2.5초 스로틀 우회). */
    private String verifyIssuedSession(String phone, String token, String code) {
        // 서비스가 하이픈을 제거해 조회하므로 스텁에도 숫자만으로 등록한다.
        stubMoClient.registerInboundMessage(phone.replace("-", ""), code);
        moPollThrottle.reset(); // 발급 직후 폴링의 2.5초 스로틀을 생략한다
        given().when().get("/api/v1/auth/phone-verifications/" + token)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("VERIFIED"));
        return token;
    }

    private String uniquePhone() {
        return String.format("010-9%03d-0000", sequence.incrementAndGet());
    }

    private String uniqueStudentId() {
        return String.valueOf(20250000 + sequence.incrementAndGet());
    }
}
