package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationEventType;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
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
class UserPhoneChangeTest extends IntegrationTestBase {

    private static final String PASSWORD = "Abcd1234!";

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
    private PhoneVerificationEventRepository phoneVerificationEventRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // MO 세션 시각은 서버(seoulClock)와 같은 기준으로 시드해야 한다 — raw now() 는 CI(UTC JVM)에서 +9h 어긋난다.
    @Autowired
    private Clock clock;

    // 가입 사용자·발급 번호 유일성 보장용 시퀀스.
    private final AtomicLong sequence = new AtomicLong(0);

    /** 가입+로그인을 마친 사용자 — 액세스 토큰과 가입 시 발급된 userId 를 함께 보관한다. */
    private record AuthenticatedUser(String accessToken, Long userId) {}

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // @SpringBootTest 컨텍스트 공유로 in-memory 상태가 누적되므로 테스트마다 초기화한다.
        rateLimiter.reset();
        moPollThrottle.reset();
        stubMoClient.clear();
    }

    @Test
    @DisplayName("로그인 없이 번호 변경 인증을 시작하면 401 로 거부된다")
    void issuePhoneChangeWithoutAuthReturns401() {
        given().contentType(ContentType.JSON)
                .body(Map.of("phone", uniquePhone()))
                .when().post("/api/v1/users/me/phone-verifications")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("새 번호로 번호 변경 인증을 시작하면 PHONE_CHANGE 세션이 본인을 대상으로 발급된다")
    void issuePhoneChangeCreatesSessionWithTargetUser() {
        AuthenticatedUser requester = signupAndLogin(uniquePhone(), uniqueStudentId());
        String newPhone = uniquePhone();

        String token = given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + requester.accessToken())
                .body(Map.of("phone", newPhone))
                .when().post("/api/v1/users/me/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getString("data.verificationToken");

        PhoneVerification session = phoneVerificationRepository.findByToken(token).orElseThrow();
        assertThat(session.getPurpose()).isEqualTo(VerificationPurpose.PHONE_CHANGE);
        assertThat(session.getTargetUserId()).isEqualTo(requester.userId());
        assertThat(session.getPhone()).isEqualTo(newPhone);
    }

    @Test
    @DisplayName("타인이 사용 중인 번호로 번호 변경 인증을 시작하면 409 를 반환한다")
    void issuePhoneChangeWithOthersPhoneReturns409() {
        String otherPhone = uniquePhone();
        signupAndLogin(otherPhone, uniqueStudentId()); // 선점 사용자
        AuthenticatedUser requester = signupAndLogin(uniquePhone(), uniqueStudentId()); // 요청 사용자

        given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + requester.accessToken())
                .body(Map.of("phone", otherPhone))
                .when().post("/api/v1/users/me/phone-verifications")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("PHONE_ALREADY_REGISTERED"));
    }

    @Test
    @DisplayName("자기 번호 그대로도 번호 변경 인증을 시작할 수 있다(소급 재인증 경로)")
    void issuePhoneChangeWithOwnPhoneSucceeds() {
        String myPhone = uniquePhone();
        AuthenticatedUser requester = signupAndLogin(myPhone, uniqueStudentId());

        given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + requester.accessToken())
                .body(Map.of("phone", myPhone))
                .when().post("/api/v1/users/me/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("인증된 세션으로 번호를 변경하면 번호와 인증 시각이 갱신되고 세션은 소비된다")
    void changePhoneUpdatesPhoneAndConsumesSession() {
        AuthenticatedUser requester = signupAndLogin(uniquePhone(), uniqueStudentId());
        Long myUserId = requester.userId();
        String newPhone = uniquePhone();
        String token = issueAndVerifyPhoneChangeSession(requester.accessToken(), newPhone);

        given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + requester.accessToken())
                .body(Map.of("verificationToken", token))
                .when().patch("/api/v1/users/me/phone")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        User updated = userRepository.findById(myUserId).orElseThrow();
        assertThat(updated.getPhone()).isEqualTo(newPhone);
        assertThat(updated.getPhoneVerifiedAt()).isNotNull();
        assertThat(phoneVerificationRepository.findByToken(token)).isEmpty(); // consume 로 행 삭제
        // PHONE_CHANGE 소비 이벤트가 본인 userId 로 기록된다 — 셋업(signupAndLogin)의 SIGNUP CONSUMED
        // 이벤트도 같은 userId 를 갖는다. purpose 로 이 완료 경로의 이벤트만 매치해 셋업 이벤트와 구분한다.
        assertThat(phoneVerificationEventRepository.findAll())
                .anyMatch(event -> event.getEventType() == PhoneVerificationEventType.CONSUMED
                        && myUserId.equals(event.getUserId())
                        && event.getPurpose() == VerificationPurpose.PHONE_CHANGE);
    }

    @Test
    @DisplayName("다른 사용자의 인증 세션으로 번호 변경을 시도하면 403 을 반환한다")
    void changePhoneWithOthersSessionReturns403() {
        AuthenticatedUser attacker = signupAndLogin(uniquePhone(), uniqueStudentId());
        AuthenticatedUser victim = signupAndLogin(uniquePhone(), uniqueStudentId());
        String victimSessionToken = issueAndVerifyPhoneChangeSession(victim.accessToken(), uniquePhone());

        given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + attacker.accessToken())
                .body(Map.of("verificationToken", victimSessionToken))
                .when().patch("/api/v1/users/me/phone")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("가입용(SIGNUP) 세션으로는 번호를 변경할 수 없다")
    void changePhoneWithSignupPurposeSessionReturns403() {
        AuthenticatedUser requester = signupAndLogin(uniquePhone(), uniqueStudentId());
        // 공개 발급(SIGNUP purpose) 세션을 인증까지 끌어올린 뒤 완료 API 에 투입한다.
        String signupSessionToken = issueAndVerifySignupSession(uniquePhone());

        given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + requester.accessToken())
                .body(Map.of("verificationToken", signupSessionToken))
                .when().patch("/api/v1/users/me/phone")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("인증 후 완료 창(10분)이 지난 세션으로 번호 변경을 시도하면 403 을 반환한다")
    void changePhoneAfterCompletionWindowReturns403() {
        AuthenticatedUser requester = signupAndLogin(uniquePhone(), uniqueStudentId());
        String token = issueAndVerifyPhoneChangeSession(requester.accessToken(), uniquePhone());
        // verified_at 을 11분 전으로 되돌려 완료 창(10분) 초과를 시뮬레이트한다 — 절대날짜 금지, 상대 시각.
        jdbcTemplate.update(
                "UPDATE phone_verifications SET verified_at = verified_at - INTERVAL '11 minutes' WHERE token = ?",
                token);

        given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + requester.accessToken())
                .body(Map.of("verificationToken", token))
                .when().patch("/api/v1/users/me/phone")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("인증과 완료 사이에 타인이 같은 번호로 가입했다면 409 로 차단된다")
    void changePhoneToctouDuplicateReturns409() {
        AuthenticatedUser requester = signupAndLogin(uniquePhone(), uniqueStudentId());
        String contestedPhone = uniquePhone();
        String token = issueAndVerifyPhoneChangeSession(requester.accessToken(), contestedPhone);
        // 인증~완료 사이 창에서 타인이 contestedPhone 을 선점한 상황을 users 에만 만든다 — 세션 행은
        // 불가침으로 둔다(phone_verifications.phone 은 unique 라, 같은 번호 SIGNUP 발급이 기존 PHONE_CHANGE
        // 세션 행을 덮어써 미리 확보한 token 이 사라지면 409 가 아닌 403 이 되어 버린다).
        String preemptorStudentId = uniqueStudentId();
        signupAndLogin(uniquePhone(), preemptorStudentId);
        jdbcTemplate.update("UPDATE users SET phone = ? WHERE student_id = ?", contestedPhone, preemptorStudentId);

        given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + requester.accessToken())
                .body(Map.of("verificationToken", token))
                .when().patch("/api/v1/users/me/phone")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    /**
     * 인증 완료 SIGNUP 세션 시드 → 가입 → 로그인까지 마친 사용자를 만든다.
     * 세션 시드는 AuthControllerSignupTest 의 prepareVerifiedPhone 패턴, 가입·로그인은 실제 API 경유.
     */
    private AuthenticatedUser signupAndLogin(String phone, String studentId) {
        LocalDateTime seededAt = LocalDateTime.now(clock);
        PhoneVerification verifiedSession = PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, seededAt);
        verifiedSession.markVerified(seededAt);
        String verificationToken = phoneVerificationRepository.save(verifiedSession).getToken();

        Long userId = given().contentType(ContentType.JSON)
                .body(Map.of(
                        "studentId", studentId,
                        "name", "번호변경자",
                        "password", PASSWORD,
                        "grade", "JUNIOR",
                        "college", "IT_ENGINEERING",
                        "major", "컴퓨터정보공학부",
                        "verificationToken", verificationToken,
                        "termsOfServiceAgreed", true,
                        "privacyPolicyAgreed", true))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        String accessToken = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", studentId, "password", PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getString("data.accessToken");

        return new AuthenticatedUser(accessToken, userId);
    }

    /**
     * 새 번호로 PHONE_CHANGE 세션을 발급(본인 JWT)하고 스텁 문자 수신→상태 조회 폴링으로 VERIFIED 까지
     * 끌어올린 뒤, 완료 API 에 넣을 verificationToken 을 돌려준다.
     */
    private String issueAndVerifyPhoneChangeSession(String accessToken, String newPhone) {
        JsonPath issueBody = given().contentType(ContentType.JSON)
                .header("Authorization", "Bearer " + accessToken)
                .body(Map.of("phone", newPhone))
                .when().post("/api/v1/users/me/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath();
        return verifyIssuedSession(newPhone, issueBody.getString("data.verificationToken"),
                issueBody.getString("data.code"));
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
