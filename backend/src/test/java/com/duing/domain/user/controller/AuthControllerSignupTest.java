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
        // 미인증(403)이 아니라 중복(409)으로 막혀야 한다(기존 계약 보존).
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value());
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
    @DisplayName("이미 가입된 이메일로 인증코드 발송을 요청해도 미가입과 같은 201 을 반환한다")
    void sendVerificationDoesNotRevealRegisteredEmail() {
        prepareVerifiedEmail("hong@daegu.ac.kr");
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        // 가입 여부가 응답으로 드러나면 계정 열거가 가능하므로, 409 가 아니라 미가입과 똑같은 201 이어야 한다.
        given().contentType(ContentType.JSON).body(Map.of("email", "hong@daegu.ac.kr"))
                .when().post("/api/v1/auth/email-verifications")
                .then().statusCode(HttpStatus.CREATED.value());
    }
}
