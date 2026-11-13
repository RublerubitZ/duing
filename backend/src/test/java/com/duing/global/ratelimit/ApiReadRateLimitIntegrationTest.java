package com.duing.global.ratelimit;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;

/**
 * 조회 요청 제한이 실제 필터 체인에 걸려 있는지 본다 — 한도를 낮춘 전용 컨텍스트(공용 테스트 설정은 0 = 꺼짐).
 * 이 클래스만 쓰는 컨텍스트라 끝나면 닫는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "duing.rate-limit.api-read-per-minute=2")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ApiReadRateLimitIntegrationTest extends IntegrationTestBase {

    // 테스트 컨텍스트의 허용 오리진(cors.allowed-origins 기본값).
    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @LocalServerPort int port;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("공개 조회를 한도보다 많이 부르면 429 가 되고, 그 응답에도 CORS 헤더가 붙어 브라우저가 안내를 읽을 수 있다 — 쓰기 요청은 막지 않는다")
    void publicReadsOverLimitAreRejectedWithCorsHeaders() {
        // 분 경계에 걸리면 창이 한 번 바뀔 수 있어 한도(2)의 2배 + 1 건을 보낸다 — 마지막 요청은 어느 경우에도 한도를 넘는다.
        for (int requestIndex = 0; requestIndex < 4; requestIndex++) {
            RestAssured.given().header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN).when().get("/api/v1/clubs");
        }

        RestAssured.given().header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().get("/api/v1/clubs")
                .then().statusCode(HttpStatus.TOO_MANY_REQUESTS.value())
                .header(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, equalTo(ALLOWED_ORIGIN))
                .header(HttpHeaders.RETRY_AFTER, notNullValue())
                .body("message", containsString("요청이 너무 많습니다"));

        // 쓰기는 세지 않는다 — 조회 한도를 넘긴 IP 도 로그인 요청은 필터를 지나 검증(400)까지 간다.
        RestAssured.given().contentType("application/json").body("{}")
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }
}
