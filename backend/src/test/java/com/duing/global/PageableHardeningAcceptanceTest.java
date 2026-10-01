package com.duing.global;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 페이지네이션 하드닝 검증 — (1) 공개 목록 API 의 size 가 전역 상한(100)으로 클램프되는지,
 * (2) 정렬(sort) 파라미터가 존재하지 않는 속성이거나 대소문자 무시(ignorecase)면 500 이 아니라 400 으로 응답하는지,
 * (3) 오프셋(page × size)이 int 범위를 넘는 page 가 500 이 아니라 400 으로 응답하는지.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PageableHardeningAcceptanceTest extends IntegrationTestBase {

    private static final int MAX_PAGE_SIZE = 100;
    // size 100 에서 오프셋이 int 최대값을 넘는 page — Spring Data JPA 경로가 원인 없는 예외로 500 을 내던 입력.
    private static final int PAGE_BEYOND_INT_OFFSET = Integer.MAX_VALUE;
    // size 100 에서 오프셋(2,147,483,600)이 int 범위 안에 드는 마지막 page.
    private static final int LAST_PAGE_WITHIN_INT_OFFSET = 21_474_836;

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

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
    @DisplayName("허용 목록 밖 정렬값은 응답에 반사하지 않고 고정 문구로 거부한다 — CR/LF 가 섞인 값도 본문에 남지 않는다")
    void rejectedSortValueIsNotReflectedInResponse() {
        // %0D%0A 는 디코드되면 CR/LF 다. 원문을 메시지에 실으면 응답 본문과 WARN 로그에 그대로 반사돼 로그 줄을
        // 위조할 수 있다. 인코딩을 끄고 와이어 형식 그대로 보낸다.
        String responseBody = RestAssured.given()
                .urlEncodingEnabled(false)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("sort", "name%0D%0AFORGED_LOG_LINE")
                .when().get("/api/v1/admin/users")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("지원하지 않는 정렬 조건입니다."))
                .extract().asString();
        assertThat(responseBody).doesNotContain("FORGED_LOG_LINE", "\r", "\n", "\\r", "\\n");
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

    @ParameterizedTest(name = "sort={0} 은 400")
    @ValueSource(strings = {"createdAt,ignorecase", "name,desc,ignorecase"})
    @DisplayName("관리자 회원 검색은 대소문자 무시 정렬(ignorecase)을 500 이 아니라 고정 문구의 400 으로 거부한다")
    void adminUserSearchRejectsIgnoreCaseSort(String sort) {
        // JPQL @Query 정렬은 속성 타입과 무관하게 lower(...) 로 감싸져 createdAt 이면 Hibernate 가 거부해 500 이 났다.
        // name 은 lower(u.name) 가 통하지만 정책을 하나로 두려고 함께 거부한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("sort", sort)
                .when().get("/api/v1/admin/users")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("지원하지 않는 정렬 조건입니다."));
    }

    @Test
    @DisplayName("클라이언트 sort 를 받는 실제 쿼리 엔드포인트도, 존재하지 않는 정렬 속성이면 500 이 아니라 400 을 반환한다")
    void realQueryEndpointInvalidSortReturns400() {
        // admin clubs member-history 는 #1315 부터 정렬 화이트리스트(createdAt)를 거친다 — 이 400 은 쿼리 전에
        // 화이트리스트가 낸다. 쿼리까지 간 잘못된 정렬을 전역 핸들러가 400 으로 바꾸는 백스톱은
        // GlobalExceptionHandlerSortTest 가 고정한다.
        // 이전 대상(admin facility-bookings/submission)은 #706 에서 QueryDSL 고정 정렬로 바뀌어
        // 클라이언트 sort 를 더 이상 Spring Data 로 흘리지 않는다 — 아래 고정 정렬 케이스로 별도 고정.
        Long clubId = savedClubId();
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("sort", "no_such_field")
                .when().get("/api/v1/admin/clubs/" + clubId + "/member-history")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("실제 쿼리 엔드포인트에서 유효한 정렬 속성은 정상(200) 응답한다")
    void realQueryEndpointValidSortSucceeds() {
        Long clubId = savedClubId();
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("sort", "createdAt,desc")
                .when().get("/api/v1/admin/clubs/" + clubId + "/member-history")
                .then().statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("고정 정렬(QueryDSL) 엔드포인트는 클라이언트 sort 를 무시하므로 잘못된 정렬 속성도 무해하게 200 을 반환한다")
    void fixedOrderEndpointIgnoresInvalidSort() {
        // facility submission 목록은 #706 부터 id 내림차순 고정 — 임의 속성 정렬이 원천 차단됨을 문서화한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("sort", "no_such_field")
                .when().get("/api/v1/admin/facility-bookings/submission")
                .then().statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("은행 거래 검토 목록은 오프셋이 int 범위를 넘는 page 를 500 이 아니라 400 으로 거부하고, 범위 안 page 는 200 으로 응답한다")
    void bankTransactionListRejectsPageBeyondIntOffset() {
        BankTransactionListAccess access = bankTransactionListAccessAsLeader();
        assertOffsetBoundary(access.leaderToken(), access.path());
    }

    @Test
    @DisplayName("동아리 권한 변경 이력은 오프셋이 int 범위를 넘는 page 를 500 이 아니라 400 으로 거부하고, 범위 안 page 는 200 으로 응답한다")
    void memberHistoryRejectsPageBeyondIntOffset() {
        assertOffsetBoundary(adminToken, "/api/v1/admin/clubs/" + savedClubId() + "/member-history");
    }

    @Test
    @DisplayName("관리자 회원 검색은 오프셋이 int 범위를 넘는 page 를 500 이 아니라 400 으로 거부하고, 범위 안 page 는 200 으로 응답한다")
    void adminUserSearchRejectsPageBeyondIntOffset() {
        assertOffsetBoundary(adminToken, "/api/v1/admin/users");
    }

    @Test
    @DisplayName("FAQ 무결과 검색어 목록은 오프셋이 int 범위를 넘는 page 를 500 이 아니라 400 으로 거부하고, 범위 안 page 는 200 으로 응답한다")
    void faqSearchMissesRejectsPageBeyondIntOffset() {
        assertOffsetBoundary(adminToken, "/api/v1/admin/federation/faq-search-misses");
    }

    @Test
    @DisplayName("QueryDSL 로 조회하는 공개 동아리 목록은 같은 큰 page 에도 200 과 빈 목록을 반환한다")
    void publicClubListReturnsEmptyPageForPageBeyondIntOffset() {
        // 대조군 — QueryDSL 은 오프셋을 int 최대값으로 잘라 빈 페이지를 돌려준다(기존 동작 고정).
        RestAssured.given()
                .queryParam("page", PAGE_BEYOND_INT_OFFSET)
                .queryParam("size", MAX_PAGE_SIZE)
                .when().get("/api/v1/clubs")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", empty());
    }

    @ParameterizedTest(name = "sort={0} 은 400")
    @ValueSource(strings = {"_", "rawPayload", "no_such_field", "transactionAt,ignorecase"})
    @DisplayName("은행 거래 검토 목록은 허용 목록(transactionAt) 밖의 정렬(형식 오류·응답에 없는 실재 컬럼·없는 속성)과 대소문자 무시 정렬(ignorecase)을 모두 400 으로 거부한다")
    void bankTransactionListRejectsNonWhitelistedSort(String sort) {
        BankTransactionListAccess access = bankTransactionListAccessAsLeader();
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + access.leaderToken())
                .queryParam("sort", sort)
                .when().get(access.path())
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("지원하지 않는 정렬 조건입니다."));
    }

    @Test
    @DisplayName("은행 거래 검토 목록은 허용된 정렬(transactionAt)이나 정렬 없는 요청에 200 으로 응답한다")
    void bankTransactionListAcceptsWhitelistedOrAbsentSort() {
        BankTransactionListAccess access = bankTransactionListAccessAsLeader();
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + access.leaderToken())
                .queryParam("sort", "transactionAt,desc")
                .when().get(access.path())
                .then().statusCode(HttpStatus.OK.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + access.leaderToken())
                .when().get(access.path())
                .then().statusCode(HttpStatus.OK.value());
    }

    @ParameterizedTest(name = "sort={0} 은 400")
    @ValueSource(strings = {"_", "actorUserId", "createdAt,ignorecase"})
    @DisplayName("동아리 권한 변경 이력은 허용 목록(createdAt) 밖의 정렬(형식 오류·허용 밖 실재 컬럼)과 대소문자 무시 정렬(ignorecase)을 모두 400 으로 거부한다")
    void memberHistoryRejectsNonWhitelistedSort(String sort) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("sort", sort)
                .when().get("/api/v1/admin/clubs/" + savedClubId() + "/member-history")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("지원하지 않는 정렬 조건입니다."));
    }

    @Test
    @DisplayName("동아리 권한 변경 이력은 정렬 없는 요청에 200 으로 응답한다")
    void memberHistoryAcceptsAbsentSort() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/" + savedClubId() + "/member-history")
                .then().statusCode(HttpStatus.OK.value());
    }

    /** 오프셋이 int 최대값을 넘는 page 는 400 과 안내 문구로, int 범위 안의 마지막 page 는 200 으로 응답하는지 확인한다. */
    private void assertOffsetBoundary(String token, String path) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .queryParam("page", PAGE_BEYOND_INT_OFFSET)
                .queryParam("size", MAX_PAGE_SIZE)
                .when().get(path)
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("요청한 페이지가 범위를 벗어났습니다."));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .queryParam("page", LAST_PAGE_WITHIN_INT_OFFSET)
                .queryParam("size", MAX_PAGE_SIZE)
                .when().get(path)
                .then().statusCode(HttpStatus.OK.value());
    }

    /**
     * member-history 는 동아리 존재 검증(404)이 있어 실제 동아리 픽스처가 필요하다.
     */
    private Long savedClubId() {
        return clubRepository.save(ClubFixture.academic("하드닝검증동아리")).getId();
    }

    /** 은행 거래 검토 목록 경로와, 그 동아리 회장으로 인증할 토큰. */
    private record BankTransactionListAccess(String path, String leaderToken) {
    }

    /**
     * 은행 거래 검토는 ACTIVE 동아리의 운영진만 볼 수 있다 — Club.create 기본 상태(PENDING_APPROVAL)를 ACTIVE 로
     * 바꾸고 회장 멤버십을 만든 뒤, 목록 경로와 회장 토큰을 돌려준다.
     */
    private BankTransactionListAccess bankTransactionListAccessAsLeader() {
        Club club = clubRepository.save(ClubFixture.academic("거래검토하드닝동아리"));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return new BankTransactionListAccess(
                "/api/v1/leader/clubs/" + club.getId() + "/bank-transactions",
                jwtTokenProvider.createToken(leader.getId(), leader.getRole().name()));
    }
}
