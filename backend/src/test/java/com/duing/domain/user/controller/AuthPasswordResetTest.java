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
    /** 미가입 학번에 발급되는 decoy 번호의 마스킹 형태 — 가입 학번 응답과 육안으로 구분되지 않아야 한다. */
    private static final String MASKED_PHONE_PATTERN = "010-\\*{4}-\\d{4}";

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
    @DisplayName("가입되지 않은 학번으로 재설정을 시작해도 가입 학번과 구분되지 않는 202 와 마스킹 번호를 반환한다")
    void startPasswordResetWithUnknownStudentIdReturnsSameAccepted() {
        JsonPath body = startPasswordReset(uniqueStudentId());

        // 필드 수·형태가 가입 학번 응답과 같아야 한다 — 하나라도 비면 그 자체가 계정 존재 오라클이다.
        assertThat(body.getString("data.verificationToken")).isNotBlank();
        assertThat(body.getString("data.code")).isNotBlank();
        assertThat(body.getString("data.maskedPhone")).matches(MASKED_PHONE_PATTERN);
        PhoneVerification decoySession = phoneVerificationRepository
                .findByToken(body.getString("data.verificationToken")).orElseThrow();
        assertThat(decoySession.getPurpose()).isEqualTo(VerificationPurpose.PASSWORD_RESET);
        // 귀속 계정이 없어야 한다 — 만에 하나 인증에 도달해도 완료 API 가 400 으로 막는 안전판이다.
        assertThat(decoySession.getTargetUserId()).isNull();
    }

    @Test
    @DisplayName("가입되지 않은 학번으로 발급된 세션도 상태 조회에서 404 가 아니라 PENDING 을 반환한다")
    void unknownStudentIdSessionStatusReturnsPending() {
        String token = startPasswordReset(uniqueStudentId()).getString("data.verificationToken");

        given().contentType(ContentType.JSON).body(Map.of("verificationToken", token))
                .when().post("/api/v1/auth/phone-verifications/status")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("가입되지 않은 학번을 60초 안에 다시 시도하면 가입 학번과 동일하게 쿨다운 429 를 반환한다")
    void startPasswordResetWithUnknownStudentIdWithinCooldownReturns429() {
        String unknownStudentId = uniqueStudentId();
        startPasswordReset(unknownStudentId);

        given().contentType(ContentType.JSON).body(Map.of("studentId", unknownStudentId))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("PHONE_VERIFICATION_COOLDOWN"));
    }

    @Test
    @DisplayName("가입되지 않은 학번의 마스킹 번호는 재시도해도 같은 값이다")
    void unknownStudentIdMaskedPhoneStaysSameAcrossRetries() {
        String unknownStudentId = uniqueStudentId();
        JsonPath firstBody = startPasswordReset(unknownStudentId);
        String decoyPhone = phoneVerificationRepository
                .findByToken(firstBody.getString("data.verificationToken")).orElseThrow().getPhone();
        // 60초 쿨다운(번호당 1행) 회피 — 발급된 그 번호의 세션 행만 과거로 되돌린다.
        jdbcTemplate.update(
                "UPDATE phone_verifications SET last_issued_at = last_issued_at - INTERVAL '2 minutes' "
                        + "WHERE phone = ?", decoyPhone);

        JsonPath secondBody = startPasswordReset(unknownStudentId);

        // 재시도마다 번호가 흔들리면 "값이 바뀌는 쪽 = 미가입"이라는 새 오라클이 된다.
        assertThat(secondBody.getString("data.maskedPhone"))
                .isEqualTo(firstBody.getString("data.maskedPhone"));
    }

    @Test
    @DisplayName("가입되지 않은 학번의 세션으로 완료를 시도하면 가입 학번의 미인증 세션과 같은 403 을 반환한다")
    void completePasswordResetWithUnknownStudentIdSessionReturns403() {
        String token = startPasswordReset(uniqueStudentId()).getString("data.verificationToken");

        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("같은 학번의 재설정 시작은 시간당 3회로 제한된다")
    void startPasswordResetIsRateLimitedPerStudentId() {
        String studentId = uniqueStudentId();
        String registeredPhone = uniquePhone();
        signupUser(registeredPhone, studentId);
        // 60초 쿨다운(번호당 1행) 회피 — 시드된 그 번호의 세션 행만 과거로 되돌린다(다른 테스트 행 오염 방지).
        for (int attempt = 0; attempt < 3; attempt++) {
            startPasswordReset(studentId);
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
    @DisplayName("탈퇴한 학번으로 재설정을 시작해도 가입되지 않은 학번과 동일한 202 를 반환한다")
    void startPasswordResetForWithdrawnUserReturnsSameAccepted() {
        String studentId = uniqueStudentId();
        String registeredPhone = uniquePhone();
        signupUser(registeredPhone, studentId);
        jdbcTemplate.update("UPDATE users SET deleted_at = now() WHERE student_id = ?", studentId);

        JsonPath body = startPasswordReset(studentId);

        assertThat(body.getString("data.maskedPhone")).matches(MASKED_PHONE_PATTERN);
        PhoneVerification decoySession = phoneVerificationRepository
                .findByToken(body.getString("data.verificationToken")).orElseThrow();
        // 탈퇴 계정의 실제 등록 번호가 아니라 decoy 번호로 발급된다 — 탈퇴자에게 문자 인증 경로를 열지 않는다.
        assertThat(decoySession.getPhone()).isNotEqualTo(registeredPhone);
        assertThat(decoySession.getTargetUserId()).isNull();
    }

    @Test
    @DisplayName("번호가 V19 placeholder 인 레거시 계정도 decoy 번호로 발급돼 실계정임이 드러나지 않는다")
    void startPasswordResetForPlaceholderPhoneUserUsesDecoy() {
        String studentId = uniqueStudentId();
        signupUser(uniquePhone(), studentId);
        // V19 가 기존 계정에 백필한 상태를 재현한다 — 운영 백필 마이그레이션이 아직 없어 활성 계정에 남을 수 있다.
        jdbcTemplate.update("UPDATE users SET phone = '010-0000-0000' WHERE student_id = ?", studentId);

        JsonPath body = startPasswordReset(studentId);

        // mask('010-0000-0000') = '010-****-0000' 이 그대로 나가면, 그 고정값만으로 해당 학번이
        // 레거시 실계정임이 익명 1회 요청에 확정된다. decoy 로 보내 그 신호를 없앤다.
        assertThat(body.getString("data.maskedPhone")).matches(MASKED_PHONE_PATTERN);
        PhoneVerification decoySession = phoneVerificationRepository
                .findByToken(body.getString("data.verificationToken")).orElseThrow();
        assertThat(decoySession.getPhone()).isNotEqualTo("010-0000-0000");
        assertThat(decoySession.getTargetUserId()).isNull();
    }

    @Test
    @DisplayName("번호가 placeholder 인 계정이 둘이어도 서로의 재설정 세션을 쿨다운으로 막지 않는다")
    void placeholderPhoneUsersDoNotShareVerificationSession() {
        String firstStudentId = uniqueStudentId();
        String secondStudentId = uniqueStudentId();
        signupUser(uniquePhone(), firstStudentId);
        signupUser(uniquePhone(), secondStudentId);
        jdbcTemplate.update("UPDATE users SET phone = '010-0000-0000' WHERE student_id IN (?, ?)",
                firstStudentId, secondStudentId);

        String firstPhone = phoneVerificationRepository
                .findByToken(startPasswordReset(firstStudentId).getString("data.verificationToken"))
                .orElseThrow().getPhone();
        // uk_phone_verifications_phone(V79:17)에는 placeholder 예외가 없어, 둘 다 실번호로 발급하면
        // 같은 세션 행을 공유해 두 번째 요청이 60초 쿨다운 429 로 막힌다.
        String secondPhone = phoneVerificationRepository
                .findByToken(startPasswordReset(secondStudentId).getString("data.verificationToken"))
                .orElseThrow().getPhone();

        assertThat(firstPhone).isNotEqualTo(secondPhone);
    }

    @Test
    @DisplayName("미가입 학번의 세션은 문자 인증을 통과해도 비밀번호를 바꾸지 못한다 — decoy 의 최종 안전판")
    void verifiedDecoySessionStillCannotResetPassword() {
        // decoy 번호는 소유자가 없어 실제로는 인증까지 갈 수 없지만, 번호 충돌 등으로 VERIFIED 에 도달하더라도
        // targetUserId=null 이라 완료 단계가 400 으로 막는다는 계약을 고정한다.
        String token = issueAndVerifyResetSession(uniqueStudentId());

        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("PASSWORD_RESET_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("가입되지 않은 학번의 재설정 시작도 가입 학번과 같은 만큼만 IP 발급 한도를 소모한다")
    void startPasswordResetConsumesSameIpIssueQuotaForUnknownStudentId() {
        // 매 요청 학번이 서로 달라 학번당 3회 제한엔 걸리지 않는다 — IP 발급 축만 격리 검증한다.
        // 발급 IP 분당 한도(10)는 서비스 package-private 상수라 형제 테스트처럼 리터럴로 맞춘다.
        // 미가입 요청이 IP 창을 2회 소모하던 옛 이중 계수가 살아나면 6번째 요청이 429 가 돼 루프가 깨진다 —
        // 상태코드를 균일하게 만들어도 "429 가 몇 번째에 뜨는지"로 실계정을 셀 수 있던 오라클의 회귀 잠금이다.
        for (int attempt = 0; attempt < 10; attempt++) {
            startPasswordReset(uniqueStudentId());
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
        String token = startPasswordReset(studentId).getString("data.verificationToken");

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
    @DisplayName("인증과 완료 사이에 계정의 등록 번호가 다른 번호로 바뀌면 400 을 반환한다")
    void completePasswordResetAfterRegisteredPhoneChangedReturns400() {
        String studentId = uniqueStudentId();
        signupUser(uniquePhone(), studentId);
        String token = issueAndVerifyResetSession(studentId);
        // 인증 후 계정 등록 번호가 다른 번호로 바뀌면 세션 번호는 더 이상 "그 계정의 등록 번호"가 아니다.
        jdbcTemplate.update("UPDATE users SET phone = ? WHERE student_id = ?", uniquePhone(), studentId);

        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", "newPass123!"))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("PASSWORD_RESET_NOT_ALLOWED"));
    }

    @Test
    @DisplayName("기존 비밀번호와 동일한 새 비밀번호로 재설정하면 400 을 반환한다")
    void completePasswordResetWithSamePasswordReturns400() {
        String studentId = uniqueStudentId();
        signupUser(uniquePhone(), studentId);
        String token = issueAndVerifyResetSession(studentId);

        given().contentType(ContentType.JSON)
                .body(Map.of("verificationToken", token, "newPassword", ORIGINAL_PASSWORD))
                .when().post("/api/v1/auth/password-resets/complete")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("새 비밀번호는 기존 비밀번호와 달라야 합니다."));
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

    /** 재설정 시작 요청 — 계정 존재 여부와 무관한 202 를 단언하고 응답 본문을 돌려준다. */
    private JsonPath startPasswordReset(String studentId) {
        return given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId))
                .when().post("/api/v1/auth/password-resets")
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().jsonPath();
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
        JsonPath issueBody = startPasswordReset(studentId);
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
        given().contentType(ContentType.JSON).body(Map.of("verificationToken", token))
                .when().post("/api/v1/auth/phone-verifications/status")
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
