package com.duing.global;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

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
 * 페이지네이션 하드닝 검증 — (1) 공개 목록 API 의 size 가 전역 상한(100)으로 클램프되는지,
 * (2) 정렬(sort) 파라미터가 존재하지 않는 속성이면 500 이 아니라 400 으로 응답하는지.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PageableHardeningAcceptanceTest extends IntegrationTestBase {

    private static final int MAX_PAGE_SIZE = 100;

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
    }

    @Test
    @DisplayName("공개 목록 API 에 과도한 size 를 요청해도 전역 상한(100)으로 클램프된다")
    void publicListSizeIsClampedToMax() {
        RestAssured.given()
                .queryParam("size", 2000)
                .when().get("/api/v1/clubs")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.size", lessThanOrEqualTo(MAX_PAGE_SIZE))
                .body("data.size", equalTo(MAX_PAGE_SIZE));
    }

    @Test
    @DisplayName("존재하지 않는 정렬 속성으로 요청하면 500 이 아니라 400 을 반환한다")
    void invalidSortPropertyReturns400() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("q", "test")
                .queryParam("sort", "no_such_field")
                .when().get("/api/v1/admin/users")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("허용 목록 밖의 실제 존재하는 속성으로 정렬해도 화이트리스트가 400 으로 거부한다")
    void nonWhitelistedButRealPropertyIsRejectedWith400() {
        // passwordHash 는 User 엔티티에 실재하지만 정렬 허용 목록 밖이라 400 이어야 한다(임의 필드 정렬 차단).
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("q", "test")
                .queryParam("sort", "passwordHash")
                .when().get("/api/v1/admin/users")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("허용된 정렬 속성으로 요청하면 정상(200) 응답한다")
    void whitelistedSortPropertySucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("q", "test")
                .queryParam("sort", "createdAt,desc")
                .when().get("/api/v1/admin/users")
                .then().statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("화이트리스트 없이 클라이언트 sort 를 받는 실제 쿼리 엔드포인트도, 존재하지 않는 정렬 속성이면 500 이 아니라 400 을 반환한다")
    void realQueryEndpointInvalidSortReturns400() {
        // 화이트리스트가 없는 엔드포인트(admin recertification-rounds)에서 실제 Spring Data 쿼리가 잘못된
        // 정렬 속성을 만나 던지는 예외가 전역 핸들러를 통해 400 으로 변환되는지 end-to-end 로 고정한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("sort", "no_such_field")
                .when().get("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("실제 쿼리 엔드포인트에서 유효한 정렬 속성은 정상(200) 응답한다")
    void realQueryEndpointValidSortSucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("sort", "year,desc")
                .when().get("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.OK.value());
    }
}
