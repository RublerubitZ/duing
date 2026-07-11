package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.domain.user.service.PhoneVerificationRateLimiter;
import com.duing.global.mo.StubMoVerificationClient;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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

    private String uniquePhone() {
        return String.format("010-9%03d-0000", sequence.incrementAndGet());
    }

    private String uniqueStudentId() {
        return String.valueOf(20250000 + sequence.incrementAndGet());
    }
}
