package com.duing.domain.globalevent;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
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
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class GlobalEventAcceptanceTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now()));
    }

    private Map<String, Object> samplePayload(LocalDateTime start, LocalDateTime end) {
        Map<String, Object> body = new HashMap<>();
        body.put("title", "가을 동아리 박람회");
        body.put("description", "박람회 안내");
        body.put("startAt", start.toString());
        body.put("endAt", end.toString());
        body.put("location", "중앙광장");
        body.put("linkUrl", "https://example.com/info");
        body.put("category", "FAIR");
        return body;
    }

    private Long createAsAdmin(LocalDateTime start, LocalDateTime end) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(samplePayload(start, end))
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");
    }

    @Test
    @DisplayName("ADMIN 이 등록한 글로벌 이벤트를 비로그인 사용자가 조회한다")
    void publicListWithoutAuth() {
        LocalDateTime start = LocalDateTime.now().plusDays(10).withNano(0);
        createAsAdmin(start, start.plusHours(8));

        RestAssured.given()
                .when().get("/api/v1/global-events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(greaterThanOrEqualTo(1)))
                .body("data[0].category", equalTo("FAIR"));
    }

    @Test
    @DisplayName("from/to 기본값은 today-30d ~ today+180d 로 적용된다")
    void publicWindowDefaults() {
        LocalDateTime inside = LocalDateTime.now().plusDays(10).withNano(0);
        createAsAdmin(inside, inside.plusHours(2));

        LocalDateTime outside = LocalDateTime.now().plusDays(300).withNano(0);
        createAsAdmin(outside, outside.plusHours(2));

        RestAssured.given()
                .when().get("/api/v1/global-events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1));
    }

    @Test
    @DisplayName("윈도우가 400일을 초과하면 400 을 반환한다")
    void publicWindowCap() {
        LocalDate from = LocalDate.now().minusDays(1);
        LocalDate to = LocalDate.now().plusDays(500);
        RestAssured.given()
                .when().get("/api/v1/global-events?from=" + from + "&to=" + to)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 글로벌 이벤트 상세는 404 를 반환한다")
    void publicDetailNotFound() {
        RestAssured.given()
                .when().get("/api/v1/global-events/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("STUDENT 가 어드민 엔드포인트에 접근하면 403 을 반환한다")
    void studentForbiddenOnAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("title 이 공백이면 생성 요청은 400 을 반환한다")
    void createInvalidTitle() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Map<String, Object> body = samplePayload(start, start.plusHours(1));
        body.put("title", "   ");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("endAt 이 startAt 보다 이르면 400 을 반환한다")
    void createInvalidPeriod() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Map<String, Object> body = samplePayload(start, start.minusHours(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("linkUrl 이 http(s) 로 시작하지 않으면 400 을 반환한다")
    void createInvalidLinkUrl() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Map<String, Object> body = samplePayload(start, start.plusHours(1));
        body.put("linkUrl", "javascript:alert(1)");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("category 가 null 이면 400 을 반환한다")
    void createNullCategory() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Map<String, Object> body = samplePayload(start, start.plusHours(1));
        body.remove("category");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("ADMIN 이 부분 수정·삭제하면 공개 목록에서 반영된다")
    void adminUpdateAndDelete() {
        LocalDateTime start = LocalDateTime.now().plusDays(5).withNano(0);
        Long eventId = createAsAdmin(start, start.plusHours(2));

        Map<String, Object> patch = new HashMap<>();
        patch.put("title", "가을 동아리 박람회 (수정)");
        patch.put("linkUrl", "https://example.com/v2");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(patch)
                .when().patch("/api/v1/admin/global-events/" + eventId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .when().get("/api/v1/global-events/" + eventId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.title", equalTo("가을 동아리 박람회 (수정)"))
                .body("data.linkUrl", equalTo("https://example.com/v2"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete("/api/v1/admin/global-events/" + eventId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .when().get("/api/v1/global-events/" + eventId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("카테고리 통계는 enum 6 키를 모두 0 포함으로 반환한다")
    void categoryStatsAllKeys() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        createAsAdmin(start, start.plusHours(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/global-events/category-stats")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.distribution.FAIR", equalTo(1))
                .body("data.distribution.FESTIVAL", equalTo(0))
                .body("data.distribution.APPLICATION", equalTo(0))
                .body("data.distribution.CONTEST", equalTo(0))
                .body("data.distribution.UNION", equalTo(0))
                .body("data.distribution.OTHER", equalTo(0));
    }

    @Test
    @DisplayName("어드민 목록은 카테고리 필터와 키워드를 동시에 적용한다")
    void adminListFilter() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        createAsAdmin(start, start.plusHours(1));
        Map<String, Object> festivalBody = samplePayload(start.plusDays(1), start.plusDays(1).plusHours(2));
        festivalBody.put("title", "두잉 페스티벌");
        festivalBody.put("category", "FESTIVAL");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(festivalBody)
                .when().post("/api/v1/admin/global-events")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/global-events?category=FAIR")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].category", equalTo("FAIR"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/global-events?keyword=페스티벌")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].title", equalTo("두잉 페스티벌"));
    }
}
