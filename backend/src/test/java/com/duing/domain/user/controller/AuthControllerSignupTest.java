package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationEvent;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
class AuthControllerSignupTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PhoneVerificationRepository phoneVerificationRepository;

    @Autowired
    private PhoneVerificationEventRepository phoneVerificationEventRepository;

    @Autowired
    private StubMoVerificationClient stubMoClient;

    @Autowired
    private PhoneVerificationRateLimiter rateLimiter;

    @Autowired
    private MoPollThrottle moPollThrottle;

    // MO 세션 시각은 서버(seoulClock)와 같은 기준으로 시드해야 한다 — raw now() 는 CI(UTC JVM)에서 +9h 어긋난다.
    @Autowired
    private Clock clock;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        rateLimiter.reset();
        moPollThrottle.reset();
        stubMoClient.clear();
    }

    /** 인증 완료 상태의 MO 세션을 시드하고 verificationToken 을 반환한다 — 가드 통과용. */
    private String prepareVerifiedPhone(String phone) {
        LocalDateTime now = LocalDateTime.now(clock);
        PhoneVerification verification = PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, now);
        verification.markVerified(now);
        return phoneVerificationRepository.save(verification).getToken();
    }

    private Map<String, Object> validBody(String verificationToken) {
        return Map.of(
                "studentId", "20240001",
                "name", "홍길동",
                "password", "Abcd1234!",
                "grade", "JUNIOR",
                "college", "IT_ENGINEERING",
                "major", "컴퓨터정보공학부",
                "verificationToken", verificationToken,
                "termsOfServiceAgreed", true,
                "privacyPolicyAgreed", true
        );
    }

    @Test
    @DisplayName("인증 완료된 세션 토큰으로 가입하면 201, 전화번호는 세션 값으로 저장되고 인증 시각이 기록된다")
    void signupStoresSessionPhoneAndVerifiedAt() {
        String token = prepareVerifiedPhone("010-1234-5678");

        Long userId = given().contentType(ContentType.JSON).body(validBody(token))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");

        User saved = userRepository.findById(userId).orElseThrow();
        assertThat(saved.getPhone()).isEqualTo("010-1234-5678");
        assertThat(saved.getPhoneVerifiedAt()).isNotNull();
        assertThat(saved.getTermsAgreedAt()).isNotNull();
        assertThat(saved.getMajor()).isEqualTo("컴퓨터정보공학부");
    }

    @Test
    @DisplayName("가입이 완료되면 세션 행은 삭제되고 userId 가 포함된 CONSUMED 감사 이벤트가 남는다")
    void signupConsumesSessionAndRecordsAuditEvent() {
        String token = prepareVerifiedPhone("010-1234-5678");

        Long userId = given().contentType(ContentType.JSON).body(validBody(token))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        assertThat(phoneVerificationRepository.findByToken(token)).isEmpty();
        List<PhoneVerificationEvent> consumedEvents = phoneVerificationEventRepository.findAll().stream()
                .filter(event -> event.getEventType() == PhoneVerificationEventType.CONSUMED)
                .toList();
        assertThat(consumedEvents).hasSize(1);
        assertThat(consumedEvents.get(0).getUserId()).isEqualTo(userId);
        assertThat(consumedEvents.get(0).getPhone()).isEqualTo("010-1234-5678");
    }

    @Test
    @DisplayName("같은 토큰으로 두 번 가입할 수 없다 — 두 번째 시도는 403 을 반환한다")
    void signupRejectsTokenReuse() {
        String token = prepareVerifiedPhone("010-1234-5678");
        given().contentType(ContentType.JSON).body(validBody(token))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        Map<String, Object> secondBody = new HashMap<>(validBody(token));
        secondBody.put("studentId", "20240002");

        given().contentType(ContentType.JSON).body(secondBody)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("존재하지 않는 토큰으로 가입하면 403 과 PHONE_NOT_VERIFIED 코드를 반환한다")
    void signupRejectsUnknownToken() {
        given().contentType(ContentType.JSON).body(validBody(UUID.randomUUID().toString()))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("아직 인증되지 않은(PENDING) 세션 토큰으로 가입하면 403 을 반환한다")
    void signupRejectsPendingSession() {
        PhoneVerification pending = phoneVerificationRepository.save(PhoneVerification.issue(
                "010-1234-5678", UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null,
                LocalDateTime.now(clock)));

        given().contentType(ContentType.JSON).body(validBody(pending.getToken()))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("인증 후 완료 창(30분)이 지난 세션 토큰으로 가입하면 403 을 반환한다")
    void signupRejectsSessionPastCompletionWindow() {
        LocalDateTime now = LocalDateTime.now(clock);
        PhoneVerification staleSession = PhoneVerification.issue(
                "010-1234-5678", UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null, now);
        staleSession.markVerified(now.minusMinutes(31));
        phoneVerificationRepository.save(staleSession);

        given().contentType(ContentType.JSON).body(validBody(staleSession.getToken()))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("PHONE_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("학번·전화번호 중 무엇이 중복이어도 동일한 409 메시지를 반환한다(계정 열거 방지)")
    void signupDuplicateMessageDoesNotRevealWhichField() {
        String firstToken = prepareVerifiedPhone("010-1234-5678");
        given().contentType(ContentType.JSON).body(validBody(firstToken))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        // 학번만 중복 (전화번호는 새 번호)
        String studentIdCollisionToken = prepareVerifiedPhone("010-9999-0001");
        Map<String, Object> studentIdCollisionBody = new HashMap<>(validBody(studentIdCollisionToken));
        String studentIdCollisionMessage = given().contentType(ContentType.JSON).body(studentIdCollisionBody)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .extract().jsonPath().getString("message");

        // 전화번호만 중복 (세션 번호가 이미 가입된 번호 — 인증~가입 사이 창의 TOCTOU 재검증)
        String phoneCollisionToken = prepareVerifiedPhone("010-1234-5678");
        Map<String, Object> phoneCollisionBody = new HashMap<>(validBody(phoneCollisionToken));
        phoneCollisionBody.put("studentId", "20249992");
        String phoneCollisionMessage = given().contentType(ContentType.JSON).body(phoneCollisionBody)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .extract().jsonPath().getString("message");

        assertThat(studentIdCollisionMessage)
                .isEqualTo(phoneCollisionMessage)
                .doesNotContain("학번").doesNotContain("전화번호");
    }

    @Test
    @DisplayName("verificationToken 이 없으면 400 을 반환한다")
    void signupRejectsMissingVerificationToken() {
        Map<String, Object> body = new HashMap<>(validBody("placeholder"));
        body.remove("verificationToken");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이용약관 또는 개인정보 동의가 false 면 400 을 반환한다")
    void signupRejectsWhenTermsNotAgreed() {
        Map<String, Object> body = new HashMap<>(validBody(prepareVerifiedPhone("010-1234-5678")));
        body.put("privacyPolicyAgreed", false);

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("약관 동의 필드를 아예 보내지 않아도 400 을 반환한다(null 우회 차단)")
    void signupRejectsWhenConsentFieldOmitted() {
        Map<String, Object> body = new HashMap<>(validBody(prepareVerifiedPhone("010-1234-5678")));
        body.remove("termsOfServiceAgreed");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("비밀번호가 영문만으로 구성되면 400 을 반환한다")
    void signupRejectsWeakPasswordAlphaOnly() {
        Map<String, Object> body = new HashMap<>(validBody(prepareVerifiedPhone("010-1234-5678")));
        body.put("password", "abcdefghij");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("단과대학 enum 외 값을 보내면 400 을 반환한다")
    void signupRejectsUnknownCollege() {
        Map<String, Object> body = new HashMap<>(validBody(prepareVerifiedPhone("010-1234-5678")));
        body.put("college", "UNKNOWN_COLLEGE");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("발급→문자 수신→폴링 VERIFIED→가입까지 스텁 전체 플로우가 통과한다")
    void signupFullFlowWithStubProvider() {
        JsonPath issueBody = given().contentType(ContentType.JSON).body(Map.of("phone", "010-1234-5678"))
                .when().post("/api/v1/auth/phone-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath();
        String token = issueBody.getString("data.verificationToken");
        String code = issueBody.getString("data.code");

        stubMoClient.registerInboundMessage("01012345678", code);
        moPollThrottle.reset(); // 발급 직후 폴링의 2.5초 스로틀 대기 생략

        given().contentType(ContentType.JSON).body(Map.of("verificationToken", token))
                .when().post("/api/v1/auth/phone-verifications/status")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo("VERIFIED"));

        given().contentType(ContentType.JSON).body(validBody(token))
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("같은 토큰으로 동시에 가입해도 정확히 한 명만 가입되고 나머지는 403 을 받는다")
    void concurrentSignupsWithSameTokenOnlyOneSucceeds() throws Exception {
        String token = prepareVerifiedPhone("010-1234-5678");
        List<String> studentIds = List.of("20240001", "20240002");
        List<Integer> statusCodes = Collections.synchronizedList(new ArrayList<>());

        ExecutorService pool = Executors.newFixedThreadPool(studentIds.size());
        CountDownLatch ready = new CountDownLatch(studentIds.size());
        CountDownLatch start = new CountDownLatch(1);
        try {
            for (String studentId : studentIds) {
                Map<String, Object> body = new HashMap<>(validBody(token));
                body.put("studentId", studentId);
                pool.submit(() -> {
                    ready.countDown();
                    try {
                        start.await();
                    } catch (InterruptedException interruptedException) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException(interruptedException);
                    }
                    int statusCode = given().contentType(ContentType.JSON).body(body)
                            .when().post("/api/v1/auth/signup")
                            .statusCode();
                    statusCodes.add(statusCode);
                });
            }
            ready.await();
            start.countDown(); // 모든 스레드를 동시에 발사한다 — 같은 토큰 행의 잠금 경합을 유도한다.
        } finally {
            pool.shutdown();
            pool.awaitTermination(30, TimeUnit.SECONDS);
        }

        // 행잠금(getVerifiedSessionForUpdate)이 두 트랜잭션을 직렬화한다 — 승자는 201, 패자는 커밋 후
        // 삭제된 행을 다시 읽어 403(PHONE_NOT_VERIFIED)으로 수렴한다.
        assertThat(statusCodes).containsExactlyInAnyOrder(201, 403);
        assertThat(userRepository.findAll().stream()
                .filter(user -> user.getPhone().equals("010-1234-5678"))
                .count()).isEqualTo(1);
        assertThat(phoneVerificationRepository.findByToken(token)).isEmpty();
        List<PhoneVerificationEvent> consumedEvents = phoneVerificationEventRepository.findAll().stream()
                .filter(event -> event.getEventType() == PhoneVerificationEventType.CONSUMED)
                .toList();
        assertThat(consumedEvents).hasSize(1);
    }
}
