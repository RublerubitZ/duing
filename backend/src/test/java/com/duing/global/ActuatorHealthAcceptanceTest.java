package com.duing.global;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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

    @Test
    @DisplayName("인증 없이 /actuator/health 를 200 으로 조회할 수 있고 상태는 UP 이다")
    void anonymousCanCheckHealth() {
        RestAssured.given()
            .when()
                .get("/actuator/health")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("status", equalTo("UP"));
    }

    @Test
    @DisplayName("공개 health 응답은 show-details=never 라 내부 컴포넌트(DB·디스크) 상태를 노출하지 않는다")
    void healthHidesComponentDetails() {
        RestAssured.given()
            .when()
                .get("/actuator/health")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("components", nullValue())
                .body("details", nullValue());
    }
}
