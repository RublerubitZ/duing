package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.StubEmailSender;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
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

    private static final Pattern CODE_PATTERN = Pattern.compile("(\\d{6})");
    private static final String EMAIL = "hong@daegu.ac.kr";
    // @SpringBootTest 는 RateLimiter 빈을 테스트 간 공유한다. IP 슬라이딩 윈도우는 IP 별이므로
    // 테스트마다 고유 IP(X-Forwarded-For)를 부여해 격리한다. 전역 일일 쿼터(5000)는 통합 테스트
    // 수십 건 발송으로는 닿지 않으므로 별도 리셋이 필요 없다.
    private static final AtomicInteger IP_SEQUENCE = new AtomicInteger();

    @LocalServerPort
    private int port;

    @Autowired
    private StubEmailSender stubEmailSender;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String clientIp;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        clientIp = "10.1." + IP_SEQUENCE.incrementAndGet() + ".1";
    }

    private void requestSend(String email, int expectedStatus) {
        given().contentType(ContentType.JSON).header("X-Forwarded-For", clientIp)
                .body(Map.of("email", email))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(expectedStatus);
    }

    private String sendAndExtractCode(String email) {
        given().contentType(ContentType.JSON).header("X-Forwarded-For", clientIp)
                .body(Map.of("email", email))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.expiresInSeconds", equalTo(1200));
        Matcher codeMatcher = CODE_PATTERN.matcher(stubEmailSender.lastMessage().html());
        assertThat(codeMatcher.find()).isTrue();
        return codeMatcher.group(1);
    }

    private void confirm(String email, String code, int expectedStatus) {
        given().contentType(ContentType.JSON)
                .body(Map.of("email", email, "code", code))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(expectedStatus);
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
    @DisplayName("60초 쿨다운 내 재발송 요청은 429 와 VERIFICATION_COOLDOWN 코드를 반환한다")
    void resendWithinCooldownReturns429() {
        sendAndExtractCode(EMAIL);
        given().contentType(ContentType.JSON).header("X-Forwarded-For", clientIp)
                .body(Map.of("email", EMAIL))
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

        if (firstCode.equals(secondCode)) {
            return; // 1/100만 확률로 같은 코드가 재발급되면 구분 불가 — 스킵
        }
        given().contentType(ContentType.JSON)
                .body(Map.of("email", EMAIL, "code", firstCode))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("INVALID_VERIFICATION_CODE"));
        confirm(EMAIL, secondCode, HttpStatus.OK.value());
    }

    @Test
    @DisplayName("만료된 코드 확인은 400 과 EMAIL_VERIFICATION_EXPIRED 코드를 반환한다")
    void confirmExpiredCodeReturns400() {
        String code = sendAndExtractCode(EMAIL);
        jdbcTemplate.update(
                "UPDATE email_verifications SET expires_at = NOW() - INTERVAL '1 second' WHERE email = ?",
                EMAIL);
        given().contentType(ContentType.JSON)
                .body(Map.of("email", EMAIL, "code", code))
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
        given().contentType(ContentType.JSON)
                .body(Map.of("email", EMAIL, "code", code))
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
        given().contentType(ContentType.JSON)
                .body(Map.of("email", EMAIL, "code", "123456"))
                .when().post("/api/v1/auth/email-verifications/confirm")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("EMAIL_VERIFICATION_NOT_FOUND"));
    }

    @Test
    @DisplayName("같은 IP 에서 1분 내 6번째 발송 요청은 429 와 VERIFICATION_RATE_LIMITED 를 반환한다")
    void ipRateLimitReturns429() {
        // 쿨다운(이메일 단위)에 걸리지 않도록 서로 다른 이메일 사용, 같은 clientIp 유지
        for (int request = 1; request <= 5; request++) {
            requestSend("student" + request + "@daegu.ac.kr", HttpStatus.CREATED.value());
        }
        given().contentType(ContentType.JSON).header("X-Forwarded-For", clientIp)
                .body(Map.of("email", "student6@daegu.ac.kr"))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .body("code", equalTo("VERIFICATION_RATE_LIMITED"));
    }

    @Test
    @DisplayName("기존 API 에러 응답에는 code 필드가 노출되지 않는다 (비파괴)")
    void legacyErrorResponsesOmitCodeField() {
        given().contentType(ContentType.JSON)
                .body(Map.of("email", EMAIL, "password", "wrong-pass1"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("code", nullValue());
    }
}
