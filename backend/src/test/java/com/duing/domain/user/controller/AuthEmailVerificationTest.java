package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.StubEmailSender;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.EmailVerification;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.exception.EmailVerificationException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.EmailVerificationRateLimiter;
import com.duing.global.email.EmailMessage;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
class AuthEmailVerificationTest extends IntegrationTestBase {

    // 코드 앞뒤로 숫자가 더 붙지 않는 정확히 6자리만 매칭한다(HTML 내 다른 숫자 오매칭 방지).
    private static final Pattern CODE_PATTERN = Pattern.compile("(?<!\\d)(\\d{6})(?!\\d)");
    private static final String EMAIL = "hong@daegu.ac.kr";
    private static final int EXPECTED_EXPIRES_IN_SECONDS = (int) EmailVerification.VALIDITY.getSeconds();

    @LocalServerPort
    private int port;

    @Autowired
    private StubEmailSender stubEmailSender;

    @Autowired
    private EmailVerificationRateLimiter rateLimiter;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // 가입 사용자 픽스처의 학번/전화번호 유일성 보장용 시퀀스.
    private final AtomicLong userSequence = new AtomicLong(20240000);

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // @SpringBootTest 컨텍스트 공유로 RateLimiter 빈이 누적되므로 테스트마다 초기화한다.
        rateLimiter.reset();
    }

    private void requestSend(String email, int expectedStatus) {
        given().contentType(ContentType.JSON).body(Map.of("email", email))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(expectedStatus);
    }

    private String sendAndExtractCode(String email) {
        given().contentType(ContentType.JSON).body(Map.of("email", email))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.expiresInSeconds", equalTo(EXPECTED_EXPIRES_IN_SECONDS));
        Matcher codeMatcher = CODE_PATTERN.matcher(stubEmailSender.lastMessage().html());
        assertThat(codeMatcher.find()).isTrue();
        return codeMatcher.group(1);
    }

    private void confirm(String email, String code, int expectedStatus) {
        given().contentType(ContentType.JSON).body(Map.of("email", email, "code", code))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(expectedStatus);
    }

    /** 학교 도메인으로 가입된 사용자를 만든다 — 학번/전화번호는 시퀀스로 유일성을 보장한다. */
    private void saveRegisteredUser(String email) {
        long seq = userSequence.incrementAndGet();
        userRepository.save(User.create(
                String.valueOf(seq), "가입자" + seq, email, "h", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부",
                "010-" + String.format("%04d", seq % 10000) + "-0000", LocalDateTime.now()));
    }

    /** 전역 일일 발송 쿼터를 소진시킨다 — 이후 발송 요청은 503(EMAIL_SEND_QUOTA_EXCEEDED)을 받는다. */
    private void exhaustGlobalQuota() {
        LocalDateTime now = LocalDateTime.now();
        try {
            while (true) {
                rateLimiter.reserveGlobalQuota(now);
            }
        } catch (EmailVerificationException.EmailSendQuotaExceededException quotaExhausted) {
            // 한도 도달 — 의도된 종료.
        }
    }

    @Test
    @DisplayName("발송된 코드로 확인하면 200, 응답에 만료 정보가 담긴다")
    void sendThenConfirmSucceeds() {
        String code = sendAndExtractCode(EMAIL);
        confirm(EMAIL, code, HttpStatus.OK.value());
    }

    @Test
    @DisplayName("학교 도메인이 아닌 이메일은 400 을 반환한다")
    void sendRejectsNonSchoolEmail() {
        requestSend("hong@gmail.com", HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("이미 가입된 이메일로 코드 발송을 요청하면 409 와 EMAIL_ALREADY_REGISTERED 를 반환하고 메일을 보내지 않는다")
    void registeredEmailSendReturnsConflict() {
        String registeredEmail = "registered@daegu.ac.kr";
        saveRegisteredUser(registeredEmail);
        EmailMessage lastMessageBeforeSend = stubEmailSender.lastMessage();

        // 막다른 길(오지 않는 코드를 기다림) 대신 발송 단계에서 즉시 가입 사실을 안내한다.
        given().contentType(ContentType.JSON).body(Map.of("email", registeredEmail))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("EMAIL_ALREADY_REGISTERED"));

        // 가입자에게는 실제 인증 코드 메일을 보내지 않는다.
        assertThat(stubEmailSender.lastMessage()).isSameAs(lastMessageBeforeSend);
    }

    @Test
    @DisplayName("이미 가입된 이메일은 반복 요청해도 쿨다운(429)이 아니라 항상 409 를 반환한다")
    void registeredEmailAlwaysReturnsConflictNotCooldown() {
        String registeredEmail = "cooldown@daegu.ac.kr";
        saveRegisteredUser(registeredEmail);

        // existsByEmail 검사가 쿨다운 검사보다 먼저이므로 첫 요청부터 줄곧 409 다.
        requestSend(registeredEmail, HttpStatus.CONFLICT.value());
        given().contentType(ContentType.JSON).body(Map.of("email", registeredEmail))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("EMAIL_ALREADY_REGISTERED"));
    }

    @Test
    @DisplayName("전역 발송 한도가 소진돼도 이미 가입된 이메일은 409 를 먼저 반환한다 (미가입은 503)")
    void registeredEmailReturnsConflictBeforeQuotaCheck() {
        String registeredEmail = "quota@daegu.ac.kr";
        saveRegisteredUser(registeredEmail);
        exhaustGlobalQuota();

        // 미가입 이메일은 한도 소진으로 503 을 받는다.
        given().contentType(ContentType.JSON).body(Map.of("email", "unregistered-quota@daegu.ac.kr"))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.SERVICE_UNAVAILABLE.value())
                .body("code", equalTo("EMAIL_SEND_QUOTA_EXCEEDED"));
        // 가입 이메일은 existsByEmail 가 쿼터 검사보다 먼저라 409 를 받는다.
        given().contentType(ContentType.JSON).body(Map.of("email", registeredEmail))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("code", equalTo("EMAIL_ALREADY_REGISTERED"));
    }

    @Test
    @DisplayName("60초 쿨다운 내 재발송 요청은 429 와 VERIFICATION_COOLDOWN 코드를 반환한다")
    void resendWithinCooldownReturns429() {
        sendAndExtractCode(EMAIL);
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_COOLDOWN"));
    }

    @Test
    @DisplayName("쿨다운 경과 후 재발송하면 이전 코드는 무효가 되고 새 코드만 유효하다")
    void reissueInvalidatesPreviousCode() {
        String firstCode = sendAndExtractCode(EMAIL);
        jdbcTemplate.update(
                "UPDATE email_verifications SET last_sent_at = last_sent_at - INTERVAL '61 seconds' WHERE email = ?",
                EMAIL);
        String secondCode = sendAndExtractCode(EMAIL);

        // 1/100만 확률로 같은 코드가 재발급되면 이전/새 코드 구분이 불가하므로 스킵(SKIPPED 로 기록)
        assumeTrue(!firstCode.equals(secondCode), "코드가 우연히 같아 검증 불가 — 스킵");

        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "code", firstCode))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("INVALID_VERIFICATION_CODE"));
        confirm(EMAIL, secondCode, HttpStatus.OK.value());
    }

    @Test
    @DisplayName("만료된 코드 확인은 400 과 EMAIL_VERIFICATION_EXPIRED 코드를 반환한다")
    void confirmExpiredCodeReturns400() {
        String code = sendAndExtractCode(EMAIL);
        // NOW()(DB) 와 LocalDateTime.now()(JVM) 의 타임존 차를 압도하도록 1일 과거로 만료시킨다.
        jdbcTemplate.update(
                "UPDATE email_verifications SET expires_at = NOW() - INTERVAL '1 day' WHERE email = ?",
                EMAIL);
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "code", code))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("EMAIL_VERIFICATION_EXPIRED"));
    }

    @Test
    @DisplayName("코드 5회 불일치 후 6번째 시도는 429 와 VERIFICATION_ATTEMPT_EXCEEDED 를 반환한다")
    void attemptLimitInvalidatesCode() {
        String code = sendAndExtractCode(EMAIL);
        String wrongCode = code.equals("000000") ? "000001" : "000000";

        for (int attempt = 0; attempt < 5; attempt++) {
            confirm(EMAIL, wrongCode, HttpStatus.BAD_REQUEST.value());
        }
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "code", code))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_ATTEMPT_EXCEEDED"));
    }

    @Test
    @DisplayName("인증 완료 후 동일 confirm 재호출은 200 을 반환한다 (멱등)")
    void confirmIsIdempotentAfterVerified() {
        String code = sendAndExtractCode(EMAIL);
        confirm(EMAIL, code, HttpStatus.OK.value());
        confirm(EMAIL, code, HttpStatus.OK.value());
    }

    @Test
    @DisplayName("인증 이력이 없는 이메일 confirm 은 400 과 EMAIL_VERIFICATION_NOT_FOUND 를 반환한다")
    void confirmWithoutSendReturns400() {
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "code", "123456"))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("EMAIL_VERIFICATION_NOT_FOUND"));
    }

    @Test
    @DisplayName("같은 IP 에서 1분 내 6번째 발송 요청은 429 와 VERIFICATION_RATE_LIMITED 를 반환한다")
    void ipRateLimitReturns429() {
        // 쿨다운(이메일 단위)에 걸리지 않도록 서로 다른 이메일 사용. 같은 getRemoteAddr(127.0.0.1) 라
        // IP 윈도우가 누적되어 6번째에 RATE_LIMITED 가 떠야 한다(setUp 의 reset() 으로 테스트 격리).
        for (int request = 1; request <= 5; request++) {
            requestSend("student" + request + "@daegu.ac.kr", HttpStatus.CREATED.value());
        }
        given().contentType(ContentType.JSON).body(Map.of("email", "student6@daegu.ac.kr"))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("같은 IP 에서 confirm 요청도 1분 내 11번째는 429 와 VERIFICATION_RATE_LIMITED 를 반환한다")
    void confirmIpRateLimitReturns429() {
        // confirm 전용 윈도우는 10/분. 미존재 이메일이라 1~10번째는 400(NOT_FOUND)이지만 IP 가드가
        // 먼저 돌아 윈도우를 소비하므로, 11번째에서 IP 제한(429)이 걸려야 한다(setUp 의 reset() 으로 격리).
        for (int request = 1; request <= 10; request++) {
            confirm("nobody" + request + "@daegu.ac.kr", "123456", HttpStatus.BAD_REQUEST.value());
        }
        given().contentType(ContentType.JSON)
                .body(Map.of("email", "nobody11@daegu.ac.kr", "code", "123456"))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("기존 API 에러 응답에는 code 필드가 노출되지 않는다 (비파괴)")
    void legacyErrorResponsesOmitCodeField() {
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "password", "wrong-pass1"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("code", nullValue());
    }
}
