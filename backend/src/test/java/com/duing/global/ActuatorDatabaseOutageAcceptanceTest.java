package com.duing.global;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.zaxxer.hikari.HikariDataSource;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

import javax.sql.DataSource;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ActuatorDatabaseOutageAcceptanceTest {

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("DB를 사용할 수 없어도 liveness는 유지되고 readiness만 상세 정보 없이 실패한다")
    void databaseOutageOnlyFailsReadiness() {
        assertThat(dataSource).isInstanceOf(HikariDataSource.class);
        // 실제 네트워크 timeout이 아니라 db indicator의 실패가 readiness에만 반영되는지 검증한다.
        ((HikariDataSource) dataSource).close();

        RestAssured.given()
                .when()
                    .get("/actuator/health/readiness")
                .then()
                    .statusCode(HttpStatus.SERVICE_UNAVAILABLE.value())
                    .body("status", equalTo("DOWN"))
                    .body("components", nullValue())
                    .body("details", nullValue());

        RestAssured.given()
                .when()
                    .get("/actuator/health/liveness")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("status", equalTo("UP"))
                    .body("components", nullValue())
                    .body("details", nullValue());
    }
}
