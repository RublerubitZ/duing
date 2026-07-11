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
        signupUser(uniquePhone(), studentId);
        // 60초 쿨다운(번호당 1행) 회피를 위해 각 시도 전 last_issued_at 을 과거로 되돌린다.
        for (int attempt = 0; attempt < 3; attempt++) {
            given().contentType(ContentType.JSON).body(Map.of("studentId", studentId))
                    .when().post("/api/v1/auth/password-resets")
                    .then().statusCode(HttpStatus.ACCEPTED.value());
            jdbcTemplate.update(
                    "UPDATE phone_verifications SET last_issued_at = last_issued_at - INTERVAL '2 minutes'");
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
                        "password", PASSWORD,
                        "grade", "JUNIOR",
                        "college", "IT_ENGINEERING",
                        "major", "컴퓨터정보공학부",
                        "verificationToken", verificationToken,
                        "termsOfServiceAgreed", true,
                        "privacyPolicyAgreed", true))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    private String uniquePhone() {
        return String.format("010-9%03d-0000", sequence.incrementAndGet());
    }

    private String uniqueStudentId() {
        return String.valueOf(20250000 + sequence.incrementAndGet());
    }
}
