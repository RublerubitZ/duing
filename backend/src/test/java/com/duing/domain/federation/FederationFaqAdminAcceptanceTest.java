package com.duing.domain.federation;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FederationFaqAdminAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired FederationFaqRepository faqRepository;
    @Autowired FederationFaqCategoryRepository categoryRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long adminId;
    private String adminToken;
    private String studentToken;
    private Long categoryId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminId = admin.getId();
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        categoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-관리" + sequence.incrementAndGet(), 0)).getId();
    }

    @Test
    @DisplayName("ADMIN이 FAQ를 생성하면 정렬순서가 맨 뒤로 자동 배치되고 비공개 포함 목록에서 조회된다")
    void adminCreatesFaqAppendedToEnd() {
        seedFaq("기존 질문", true, 0);

        Long createdId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "categoryId": %d, "question": "새 질문", "answer": "새 답변",
                      "pinned": false, "published": false }
                    """.formatted(categoryId))
            .when()
                .post("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/faqs?published=false")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.id == %d }.question".formatted(createdId), equalTo("새 질문"))
                .body("data.content.find { it.id == %d }.sortOrder".formatted(createdId), equalTo(1));
    }

    @Test
    @DisplayName("STUDENT가 admin FAQ API에 접근하면 403, 익명은 401을 받는다")
    void nonAdminBlocked() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
            .when()
                .get("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("FAQ 수정으로 내용·카테고리·고정·공개 여부가 모두 반영된다")
    void adminUpdatesFaq() {
        Long faqId = seedFaq("수정 전", true, 0);
        Long newCategoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-이동" + sequence.incrementAndGet(), 1)).getId();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "categoryId": %d, "question": "수정 후", "answer": "수정된 답변",
                      "pinned": true, "published": false }
                    """.formatted(newCategoryId))
            .when()
                .patch("/api/v1/admin/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        // 공개→비공개 전환이 실제 반영됐다는 증명 — 공개 단건 조회에서 사라져야 한다.
        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());

        // 나머지 필드 변경은 비공개 포함 admin 목록에서 검증한다.
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/faqs?published=false")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.id == %d }.question".formatted(faqId), equalTo("수정 후"))
                .body("data.content.find { it.id == %d }.categoryId".formatted(faqId),
                        equalTo(newCategoryId.intValue()))
                .body("data.content.find { it.id == %d }.pinned".formatted(faqId), equalTo(true));
    }

    @Test
    @DisplayName("존재하지 않는 카테고리로 FAQ를 만들면 404를 받는다")
    void createWithMissingCategoryFails() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "categoryId": 999999, "question": "질문", "answer": "답변",
                      "pinned": false, "published": true }
                    """)
            .when()
                .post("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("FAQ 삭제는 soft delete로 공개 목록에서 사라진다")
    void adminDeletesFaq() {
        Long faqId = seedFaq("삭제될 질문", true, 0);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .delete("/api/v1/admin/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("정렬 전체 교체로 FAQ 순서가 바뀌고, id 집합이 불일치하면 400을 받는다")
    void adminReordersFaqs() {
        Long firstId = seedFaq("질문 A", true, 0);
        Long secondId = seedFaq("질문 B", true, 1);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"orderedIds\": [%d, %d] }".formatted(secondId, firstId))
            .when()
                .put("/api/v1/admin/federation/faqs/order")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content[0].question", equalTo("질문 B"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"orderedIds\": [%d] }".formatted(firstId))
            .when()
                .put("/api/v1/admin/federation/faqs/order")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("카테고리를 생성·수정할 수 있고 중복 이름은 409를 받는다")
    void adminManagesCategories() {
        String name = "테스트-생성" + sequence.incrementAndGet();

        Long createdCategoryId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"name\": \"%s\" }".formatted(name))
            .when()
                .post("/api/v1/admin/federation/faq-categories")
            .then()
                .statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"name\": \"%s\" }".formatted(name))
            .when()
                .post("/api/v1/admin/federation/faq-categories")
            .then()
                .statusCode(HttpStatus.CONFLICT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"name\": \"%s-변경\", \"sortOrder\": 3 }".formatted(name))
            .when()
                .patch("/api/v1/admin/federation/faq-categories/" + createdCategoryId)
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faq-categories")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.find { it.id == %d }.sortOrder".formatted(createdCategoryId), equalTo(3));
    }

    @Test
    @DisplayName("정렬 요청에 중복 id가 섞이면 400을 받는다")
    void reorderWithDuplicateIdsFails() {
        Long firstId = seedFaq("질문 A", true, 0);
        seedFaq("질문 B", true, 1);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"orderedIds\": [%d, %d] }".formatted(firstId, firstId))
            .when()
                .put("/api/v1/admin/federation/faqs/order")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("질문이 비어 있는 FAQ 생성 요청은 400을 받는다")
    void createWithBlankQuestionFails() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "categoryId": %d, "question": "  ", "answer": "답변",
                      "pinned": false, "published": true }
                    """.formatted(categoryId))
            .when()
                .post("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 FAQ의 수정·삭제 요청은 404를 받는다")
    void updateOrDeleteMissingFaqFails() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("""
                    { "categoryId": %d, "question": "질문", "answer": "답변",
                      "pinned": false, "published": true }
                    """.formatted(categoryId))
            .when()
                .patch("/api/v1/admin/federation/faqs/999999")
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .delete("/api/v1/admin/federation/faqs/999999")
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("카테고리 이름을 다른 카테고리와 겹치게 수정하면 409를 받는다")
    void updateCategoryToDuplicateNameFails() {
        String existingName = "테스트-기존" + sequence.incrementAndGet();
        categoryRepository.save(FederationFaqCategory.create(existingName, 5));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body("{ \"name\": \"%s\", \"sortOrder\": 0 }".formatted(existingName))
            .when()
                .patch("/api/v1/admin/federation/faq-categories/" + categoryId)
            .then()
                .statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("피드백 3건(도움 2·안됨 1, sessionKey 2개+로그인 1명)이 쌓이면 admin 목록 집계가 2/1로 표시된다")
    void adminListShowsFeedbackAggregates() {
        Long faqId = seedFaq("피드백 집계 대상 질문", true, 0);

        // 서로 다른 식별자(sessionKey 2개 + 로그인 사용자 1명)로 3건 시딩 — T1 POST API 재사용.
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("helpful", true, "sessionKey", "session-admin-agg-1"))
            .when()
                .post("/api/v1/federation/faqs/" + faqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("helpful", false, "sessionKey", "session-admin-agg-2"))
            .when()
                .post("/api/v1/federation/faqs/" + faqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body(Map.of("helpful", true))
            .when()
                .post("/api/v1/federation/faqs/" + faqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.id == %d }.helpfulCount".formatted(faqId), equalTo(2))
                .body("data.content.find { it.id == %d }.notHelpfulCount".formatted(faqId), equalTo(1));
    }

    @Test
    @DisplayName("피드백이 없는 FAQ는 admin 목록에서 도움됨/안됨 집계가 0/0으로 표시된다")
    void adminListShowsZeroAggregateWithoutFeedback() {
        Long faqId = seedFaq("피드백 없는 질문", true, 0);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.find { it.id == %d }.helpfulCount".formatted(faqId), equalTo(0))
                .body("data.content.find { it.id == %d }.notHelpfulCount".formatted(faqId), equalTo(0));
    }

    // ---- helpers ----

    private Long seedFaq(String question, boolean published, int sortOrder) {
        return faqRepository.save(FederationFaq.create(
                categoryId, question, "답변 본문입니다.", false, published, sortOrder, adminId)).getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
