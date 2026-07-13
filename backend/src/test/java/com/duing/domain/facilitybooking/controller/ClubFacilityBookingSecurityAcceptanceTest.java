package com.duing.domain.facilitybooking.controller;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

/**
 * 시설 대관 신청 API 의 익명(무토큰) 접근 차단 회귀 잠금.
 *
 * <p>컨트롤러의 {@code @PreAuthorize("isAuthenticated()")} 가 1차 방어이고, SecurityConfig 의 URL 레이어
 * first-match 매처가 그 단일 실패점(어노테이션 누락·매처 재배치)을 이중화한다. 네 엔드포인트 모두 인증 없이는
 * 라우팅 전에 401 로 거부되어야 하며, 이 테스트가 매처 순서가 흐트러지는 회귀를 HTTP 레벨에서 고정한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubFacilityBookingSecurityAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("인증 없이 대관 신청 생성(POST)에 접근하면 401 로 거부된다")
    void anonymousCreateIsRejectedWith401() {
        RestAssured.given()
                .contentType(MediaType.APPLICATION_JSON_VALUE)
                .body("{}")
                .when().post("/api/v1/clubs/1/facility-bookings")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("인증 없이 대관 신청 목록(GET)에 접근하면 401 로 거부된다")
    void anonymousListIsRejectedWith401() {
        RestAssured.given()
                .when().get("/api/v1/clubs/1/facility-bookings")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("인증 없이 대관 신청 상세(GET)에 접근하면 401 로 거부된다")
    void anonymousDetailIsRejectedWith401() {
        RestAssured.given()
                .when().get("/api/v1/clubs/1/facility-bookings/1")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("인증 없이 대관 신청 취소(POST)에 접근하면 401 로 거부된다")
    void anonymousCancelIsRejectedWith401() {
        RestAssured.given()
                .contentType(MediaType.APPLICATION_JSON_VALUE)
                .when().post("/api/v1/clubs/1/facility-bookings/1/cancel")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}
