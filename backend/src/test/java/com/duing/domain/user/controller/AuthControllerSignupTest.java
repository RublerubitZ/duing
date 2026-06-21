package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.EmailVerification;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.EmailVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.EmailVerificationRateLimiter;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.Map;
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
class AuthControllerSignupTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EmailVerificationRepository emailVerificationRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EmailVerificationRateLimiter rateLimiter;

    /** 인증 완료 상태의 email_verifications 행을 만든다 — 가드 통과용. */
    private void prepareVerifiedEmail(String email) {
        LocalDateTime now = LocalDateTime.now();
        EmailVerification emailVerification = EmailVerification.issue(email, "x".repeat(64), now);
        emailVerification.verify(now);
        emailVerificationRepository.save(emailVerification);
    }

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // @SpringBootTest 컨텍스트 공유로 RateLimiter 빈이 누적되므로 테스트마다 초기화한다.
        rateLimiter.reset();
    }

    private Map<String, Object> validBody() {
        return Map.of(
                "studentId", "20240001",
                "name", "홍길동",
                "email", "hong@daegu.ac.kr",
                "password", "Abcd1234!",
                "grade", "JUNIOR",
                "college", "IT_ENGINEERING",
                "major", "컴퓨터정보공학부",
                "phone", "010-1234-5678",
                "termsOfServiceAgreed", true,
                "privacyPolicyAgreed", true
        );
    }

    @Test
    @DisplayName("프로필 필드를 모두 포함한 회원가입은 201 을 반환하고 termsAgreedAt 이 저장된다")
    void signupSucceedsWithProfileFields() {
        prepareVerifiedEmail("hong@daegu.ac.kr");
        Long userId = given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");

        User saved = userRepository.findById(userId).orElseThrow();
        assertThat(saved.getPhone()).isEqualTo("010-1234-5678");
        assertThat(saved.getTermsAgreedAt()).isNotNull();
        assertThat(saved.getMajor()).isEqualTo("컴퓨터정보공학부");

        // 가입 성공 시 인증 행이 삭제된다 (재사용 방지)
        assertThat(emailVerificationRepository.findByEmail("hong@daegu.ac.kr")).isEmpty();
    }

    @Test
    @DisplayName("이용약관 또는 개인정보 동의가 false 면 400 을 반환한다")
    void signupRejectsWhenTermsNotAgreed() {
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("privacyPolicyAgreed", false);

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("전화번호 형식이 010-XXXX-XXXX 가 아니면 400 을 반환한다")
    void signupRejectsInvalidPhoneFormat() {
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("phone", "01012345678");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("비밀번호가 영문만으로 구성되면 400 을 반환한다")
    void signupRejectsWeakPasswordAlphaOnly() {
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("password", "abcdefghij");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("단과대학 enum 외 값을 보내면 400 을 반환한다")
    void signupRejectsUnknownCollege() {
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("college", "UNKNOWN_COLLEGE");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동일 전화번호로 재가입을 시도하면 409 를 반환한다")
    void signupRejectsDuplicatePhone() {
        prepareVerifiedEmail("hong@daegu.ac.kr");
        prepareVerifiedEmail("second@daegu.ac.kr");
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("studentId", "20240002");
        body.put("email", "second@daegu.ac.kr");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("이메일 인증 없이 가입하면 403 과 EMAIL_NOT_VERIFIED 코드를 반환한다")
    void signupRejectsUnverifiedEmail() {
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("EMAIL_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("이미 가입된 이메일로 인증 없이 재가입하면 인증 가드보다 먼저 409 를 반환한다")
    void signupRejectsAlreadyRegisteredEmailBeforeVerificationGuard() {
        prepareVerifiedEmail("hong@daegu.ac.kr");
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        // 가입 성공으로 인증 행은 consume(삭제)됐다. 같은 이메일 재가입은 인증 행이 없지만,
        // 미인증(403)이 아니라 중복(409)으로 막아 "이미 가입됨"을 명확히 안내한다(중복 409 우선).
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("이메일·학번·전화번호 중 무엇이 중복이어도 동일한 409 메시지를 반환한다")
    void signupDuplicateMessageDoesNotRevealWhichField() {
        // 기준 사용자 가입 — email/studentId/phone 모두 선점한다.
        prepareVerifiedEmail("hong@daegu.ac.kr");
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        String emailCollisionMessage = duplicateSignupMessage(
                "hong@daegu.ac.kr", "20249991", "010-9999-0001");      // 이메일만 중복
        String studentIdCollisionMessage = duplicateSignupMessage(
                "dup-sid@daegu.ac.kr", "20240001", "010-9999-0002");   // 학번만 중복
        String phoneCollisionMessage = duplicateSignupMessage(
                "dup-phone@daegu.ac.kr", "20249992", "010-1234-5678"); // 전화번호만 중복

        // 세 경우의 메시지가 동일해야 어떤 필드가 중복인지 알 수 없다(계정 열거 방지).
        assertThat(emailCollisionMessage)
                .isEqualTo(studentIdCollisionMessage)
                .isEqualTo(phoneCollisionMessage)
                .doesNotContain("이메일").doesNotContain("학번").doesNotContain("전화번호");
    }

    private String duplicateSignupMessage(String email, String studentId, String phone) {
        prepareVerifiedEmail(email);
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("email", email);
        body.put("studentId", studentId);
        body.put("phone", phone);
        return given().contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .extract().jsonPath().getString("message");
    }

    @Test
    @DisplayName("인증 후 만료 시각이 지나면 가입할 수 없다")
    void signupRejectsExpiredVerification() {
        prepareVerifiedEmail("hong@daegu.ac.kr");
        // NOW()(DB) 와 LocalDateTime.now()(JVM) 의 타임존 차(최대 ±시간대)를 압도하도록 1일 과거로 만료시킨다.
        jdbcTemplate.update(
                "UPDATE email_verifications SET expires_at = NOW() - INTERVAL '1 day' WHERE email = ?",
                "hong@daegu.ac.kr");

        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.FORBIDDEN.value())
                .body("code", equalTo("EMAIL_NOT_VERIFIED"));
    }

    @Test
    @DisplayName("이미 가입된 이메일로 인증코드 발송을 요청해도 201 을 반환해 가입 여부를 노출하지 않는다")
    void sendVerificationDoesNotLeakRegisteredEmail() {
        prepareVerifiedEmail("hong@daegu.ac.kr");
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        // 가입 완료 후 같은 이메일로 다시 발송을 요청해도 신규와 동일하게 201 — 응답으로 가입 여부가 새지 않는다.
        // (가입자에겐 인증코드 대신 로그인 안내 메일이 발송된다 — 메일 내용 검증은 AuthEmailVerificationTest 가 담당)
        given().contentType(ContentType.JSON).body(Map.of("email", "hong@daegu.ac.kr"))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CREATED.value());
    }
}
