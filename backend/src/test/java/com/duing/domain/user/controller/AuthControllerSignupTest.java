package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthControllerSignupTest {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

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
        Long userId = given().contentType(ContentType.JSON).body(validBody())
                .when().post("/api/v1/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");

        User saved = userRepository.findById(userId).orElseThrow();
        assertThat(saved.getPhone()).isEqualTo("010-1234-5678");
        assertThat(saved.getTermsAgreedAt()).isNotNull();
        assertThat(saved.getMajor()).isEqualTo("컴퓨터정보공학부");
    }
}
