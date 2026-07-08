package com.duing.global.config;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/**
 * 관리자 API 네임스페이스(/api/v1/admin/**)의 URL 레이어 인가 백스톱 검증.
 *
 * <p>각 Admin 컨트롤러의 {@code @PreAuthorize("hasRole('ADMIN')")} 가 1차 방어이고, SecurityConfig 의
 * URL 레이어 규칙이 그 단일 실패점(새 컨트롤러가 어노테이션 누락)을 이중화한다. 실제 관리자 엔드포인트로
 * 역할 경계를 확인하고(미인증 401 / 일반 사용자 403 / ADMIN 통과), 추가로 어떤 컨트롤러에도 매핑되지 않은
 * 관리자 경로로 URL 레이어 자체를 @PreAuthorize 와 분리해 증명한다 — 규칙이 없다면 인증만 통과해 404 가
 * 되지만, 규칙이 있으면 라우팅(핸들러 탐색) 전에 인가가 적용되어 일반 사용자는 차단(4xx)되고 ADMIN 만
 * 404(핸들러 없음)에 도달한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminUrlLayerAuthorizationAcceptanceTest extends IntegrationTestBase {

    // 실제 매핑된 관리자 엔드포인트(모든 파라미터 optional) — 역할 경계 확인용.
    private static final String REAL_ADMIN_PATH = "/api/v1/admin/reports";
    // 어떤 컨트롤러에도 매핑되지 않은 관리자 네임스페이스 경로 — URL 레이어 인가를 @PreAuthorize 와 분리 증명.
    private static final String UNMAPPED_ADMIN_PATH = "/api/v1/admin/__authz_probe__";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = userRepository.save(UserFixture.admin());
        User student = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("인증 없이 관리자 엔드포인트에 접근하면 401 로 거부된다")
    void unauthenticatedRequestIsRejectedWith401() {
        RestAssured.given()
                .when().get(REAL_ADMIN_PATH)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("일반 사용자(STUDENT)는 관리자 엔드포인트에서 403 으로 차단된다")
    void studentIsRejectedWith403() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(REAL_ADMIN_PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 은 관리자 엔드포인트에 접근할 수 있다")
    void adminCanAccessAdminEndpoint() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(REAL_ADMIN_PATH)
                .then().statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("URL 레이어 백스톱: 컨트롤러가 없는 관리자 경로여도 일반 사용자는 라우팅 전에 403 으로 차단된다(404 아님)")
    void urlLayerBlocksNonAdminBeforeRoutingOnUnmappedAdminPath() {
        // URL 규칙이 없다면 인증된 사용자는 핸들러 부재로 404 를 받는다. 규칙이 라우팅 전에 인가를 강제하고
        // JwtAccessDeniedHandler 가 이를 403 으로 통일하므로, 일반 사용자는 핸들러에 도달하지 못하고 403 을 받는다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(UNMAPPED_ADMIN_PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("URL 레이어 백스톱: ADMIN 은 인가를 통과하므로 컨트롤러가 없는 경로에서 404 에 도달한다")
    void adminPassesUrlLayerAndReaches404OnUnmappedAdminPath() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(UNMAPPED_ADMIN_PATH)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }
}
