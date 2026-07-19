package com.duing.global;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ActuatorHealthAcceptanceTest {

    @LocalServerPort int port;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @ParameterizedTest(name = "{0}은 인증 없이 정상 상태를 반환한다")
    @ValueSource(strings = {
            "/actuator/health",
            "/actuator/health/liveness",
            "/actuator/health/readiness"
    })
    @DisplayName("공개 health endpoint는 인증 없이 200과 UP을 반환한다")
    void anonymousCanCheckPublicHealthEndpoints(String endpoint) {
        RestAssured.given()
                .when()
                    .get(endpoint)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("status", equalTo("UP"));
    }

    @ParameterizedTest(name = "{0}은 내부 상태를 노출하지 않는다")
    @ValueSource(strings = {
            "/actuator/health",
            "/actuator/health/liveness",
            "/actuator/health/readiness"
    })
    @DisplayName("공개 health endpoint는 내부 component와 상세 정보를 노출하지 않는다")
    void publicHealthEndpointsHideComponentDetails(String endpoint) {
        RestAssured.given()
                .when()
                    .get(endpoint)
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("components", nullValue())
                    .body("details", nullValue());
    }

    @Test
    @DisplayName("명시적으로 공개하지 않은 health 하위 경로는 인증을 요구한다")
    void undocumentedHealthSubpathRequiresAuthentication() {
        RestAssured.given()
                .when()
                    .get("/actuator/health/db")
                .then()
                    .statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}
