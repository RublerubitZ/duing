package com.duing.domain.promotion;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PromotionAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String leaderToken;
    private String studentToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User student = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());

        Club club = clubRepository.save(Club.create("동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 홍보 요청 제출은 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    @DisplayName("LEADER 가 홍보 요청을 제출하면 201")
    void createRequestSucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "행사 홍보",
                        "description", "내용"))
                .when().post("/api/v1/clubs/" + clubId + "/promotion-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("ok", equalTo(true))
                .body("data", notNullValue());
    }

    @Test
    @DisplayName("MEMBER(운영진 아님) 가 홍보 요청 시 403")
    void nonManagerForbidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "T", "description", "D"))
                .when().post("/api/v1/clubs/" + clubId + "/promotion-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("동일 club PENDING 중복은 409")
    void duplicatePendingConflict() {
        Map<String, Object> body = Map.of("title", "T", "description", "D");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/promotion-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/promotion-requests")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("STUDENT 가 /admin/promotion-requests 호출 시 403")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/promotion-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 이 Promotion 을 생성하고 비로그인 GET /promotions 로 조회된다")
    void publicListShowsAdminCreatedActivePromotion() {
        Long promotionId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "배너",
                        "bannerImageUrl", "/files/b.png",
                        "active", true,
                        "displayOrder", 1,
                        "palette", "INK"))
                .when().post("/api/v1/admin/promotions")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .when().get("/api/v1/promotions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].id", equalTo(promotionId.intValue()))
                .body("data.content[0].title", equalTo("배너"));
    }

    @Test
    @DisplayName("배너 등록 시 title 이 비어 있으면 400 을 반환한다")
    void createPromotionWithBlankTitleReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "",
                        "bannerImageUrl", "/files/b.png",
                        "active", true,
                        "displayOrder", 1,
                        "palette", "INK"))
                .when().post("/api/v1/admin/promotions")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("홍보 요청 처리 시 status 가 누락되면 400 을 반환한다")
    void processPromotionRequestWithMissingStatusReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("actionNote", "메모"))
                .when().patch("/api/v1/admin/promotion-requests/999999999")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("ADMIN 이 단건 GET /admin/promotions/{id} 로 배너를 조회할 수 있다")
    void adminGetPromotionById() {
        Long promotionId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "단건조회배너",
                        "bannerImageUrl", "/files/b.png",
                        "clubId", clubId,
                        "active", true,
                        "displayOrder", 3,
                        "palette", "SAGE"))
                .when().post("/api/v1/admin/promotions")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/promotions/" + promotionId)
                .then().statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("data.id", equalTo(promotionId.intValue()))
                .body("data.title", equalTo("단건조회배너"))
                .body("data.active", equalTo(true))
                .body("data.club.id", equalTo(clubId.intValue()));
    }

    @Test
    @DisplayName("존재하지 않는 promotionId 로 조회 시 404")
    void getPromotionNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/promotions/999999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("STUDENT 가 단건 조회를 호출하면 403")
    void getPromotionForbidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/promotions/1")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("이미지 없이 텍스트+팔레트만으로 배너를 등록할 수 있고, 공개 응답에 새 필드들이 포함된다")
    void textOnlyBannerCreatesAndPublicListsWithNewFields() {
        Long promotionId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "가을 동아리 박람회 2025",
                        "active", true,
                        "displayOrder", 0,
                        "palette", "INK",
                        "tag", "EVENT · 9.25 — 9.27",
                        "subtitle", "67개 동아리 · 80개 부스 · 중앙광장",
                        "ctaLabel", "박람회 자세히 보기",
                        "emoji", "🍂"))
                .when().post("/api/v1/admin/promotions")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .when().get("/api/v1/promotions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].id", equalTo(promotionId.intValue()))
                .body("data.content[0].title", equalTo("가을 동아리 박람회 2025"))
                .body("data.content[0].bannerImageUrl", org.hamcrest.Matchers.nullValue())
                .body("data.content[0].palette", equalTo("INK"))
                .body("data.content[0].tag", equalTo("EVENT · 9.25 — 9.27"))
                .body("data.content[0].emoji", equalTo("🍂"));
    }

    @Test
    @DisplayName("palette 가 누락되면 400 을 반환한다")
    void createWithoutPaletteReturnsBadRequest() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "배너",
                        "active", true,
                        "displayOrder", 0))
                .when().post("/api/v1/admin/promotions")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("active=false 인 Promotion 은 공개 목록에서 빠진다")
    void inactivePromotionHidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "비활성 배너",
                        "bannerImageUrl", "/files/b.png",
                        "active", false,
                        "displayOrder", 1,
                        "palette", "INK"))
                .when().post("/api/v1/admin/promotions")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .when().get("/api/v1/promotions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(0));
    }
}
