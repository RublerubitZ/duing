package com.duing.global.config;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.not;

import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

// forward-headers-strategy=native 로 운영(프록시 뒤)과 동일하게 X-Forwarded-Proto 를 신뢰하게 해,
// 보안 요청에서만 emit 되는 HSTS 까지 검증한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.forward-headers-strategy=native")
class SecurityResponseHeadersTest {

    @LocalServerPort
    int port;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("모든 응답에 보안 헤더(nosniff·X-Frame-Options DENY·Referrer-Policy·Permissions-Policy)가 포함된다")
    void securityHeadersArePresentOnEveryResponse() {
        // 인증 불필요한 permitAll 엔드포인트로 필터 체인이 부착하는 응답 헤더를 검증한다.
        RestAssured.given()
                .when().get("/actuator/health")
                .then()
                .statusCode(200)
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("X-Frame-Options", equalTo("DENY"))
                .header("Referrer-Policy", equalTo("strict-origin-when-cross-origin"))
                .header("Permissions-Policy", equalTo("camera=(), microphone=(), geolocation=(), payment=()"));
    }

    @Test
    @DisplayName("HTTPS(프록시 X-Forwarded-Proto) 요청에는 HSTS 헤더가 preload 없이 붙는다")
    void hstsHeaderIsEmittedOnForwardedHttpsRequest() {
        // 운영은 Caddy 가 X-Forwarded-Proto=https 를 주입하고 백엔드는 forward-headers-strategy=native 로 신뢰한다.
        // 그 경로를 재현해 HSTS emit 을 검증하고, 비가역 디렉티브인 preload 가 빠져 있음을 함께 고정한다.
        RestAssured.given()
                .header("X-Forwarded-Proto", "https")
                .when().get("/actuator/health")
                .then()
                .statusCode(200)
                .header("Strict-Transport-Security", containsString("max-age=63072000"))
                .header("Strict-Transport-Security", containsString("includeSubDomains"))
                .header("Strict-Transport-Security", not(containsString("preload")));
    }
}
