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
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FederationFaqPublicAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired FederationFaqRepository faqRepository;
    @Autowired FederationFaqCategoryRepository categoryRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long authorId;
    private Long registrationCategoryId;
    private String registrationCategoryName;
    private Long facilityCategoryId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        authorId = saveUser(UserRole.ADMIN).getId();
        // 카테고리 이름은 유니크 인덱스가 있어 시퀀스를 붙여 충돌을 막는다.
        registrationCategoryName = "테스트-등록" + sequence.incrementAndGet();
        registrationCategoryId = categoryRepository
                .save(FederationFaqCategory.create(registrationCategoryName, 10)).getId();
        facilityCategoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-시설" + sequence.incrementAndGet(), 11)).getId();
    }

    @Test
    @DisplayName("비로그인 사용자도 공개 FAQ 목록을 고정 우선 순서로 조회할 수 있다")
    void anonymousFetchesPublishedFaqsPinnedFirst() {
        seedFaq(registrationCategoryId, "일반 질문", true, 5, false);
        seedFaq(registrationCategoryId, "고정 질문", true, 9, true);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("data.content[0].question", equalTo("고정 질문"))
                .body("data.content[0].pinned", equalTo(true))
                .body("data.content[0].categoryName", equalTo(registrationCategoryName));
    }

    @Test
    @DisplayName("비공개 FAQ는 목록에서 제외되고 단건 조회는 404를 반환한다")
    void unpublishedFaqIsHiddenFromListAndDetail() {
        Long hiddenFaqId = seedFaq(registrationCategoryId, "비공개 질문", false, 0, false);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.findAll { it.question == '비공개 질문' }.size()", equalTo(0));

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + hiddenFaqId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("삭제된 FAQ 단건 조회도 404를 반환한다")
    void deletedFaqReturnsNotFound() {
        Long faqId = seedFaq(registrationCategoryId, "삭제될 질문", true, 0, false);
        faqRepository.deleteById(faqId); // @SQLDelete soft delete

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("공개 FAQ 단건은 딥링크용으로 비로그인 조회가 가능하다")
    void anonymousFetchesSinglePublishedFaq() {
        Long faqId = seedFaq(facilityCategoryId, "체육관 대여는 어떻게 하나요?", true, 0, false);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs/" + faqId)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.question", equalTo("체육관 대여는 어떻게 하나요?"));
    }

    @Test
    @DisplayName("카테고리 필터와 키워드 검색이 함께 동작한다")
    void filtersByCategoryAndKeyword() {
        seedFaq(registrationCategoryId, "동아리 등록 절차", true, 0, false);
        seedFaq(facilityCategoryId, "체육관 대여 절차", true, 0, false);

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs?categoryId=" + facilityCategoryId + "&keyword=대여")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1))
                .body("data.content[0].question", equalTo("체육관 대여 절차"));
    }

    @Test
    @DisplayName("카테고리 목록은 정렬순서 오름차순으로 반환된다")
    void categoriesOrderedBySortOrder() {
        String firstName = "테스트-정렬A" + sequence.incrementAndGet();
        String secondName = "테스트-정렬B" + sequence.incrementAndGet();
        // 저장은 정렬 역순 — "저장 순서가 아니라 sort_order 로 정렬됨"을 검증한다.
        // @BeforeEach 카테고리는 sortOrder 10/11 이라 이 둘(5/6)보다 뒤로 밀린다.
        categoryRepository.save(FederationFaqCategory.create(secondName, 6));
        categoryRepository.save(FederationFaqCategory.create(firstName, 5));

        RestAssured.given()
            .when()
                .get("/api/v1/federation/faq-categories")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("data[0].name", equalTo(firstName))
                .body("data[1].name", equalTo(secondName));
    }

    @Test
    @DisplayName("공개 FAQ 목록의 페이지 크기는 상한 100으로 제한된다")
    void listPageSizeIsCappedAt100() {
        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs?size=500")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.size", equalTo(100));
    }

    @Test
    @DisplayName("같은 프리픽스의 비밀문의 경로는 익명 접근 시 401로 차단된다 — /federation/** 와일드카드 금지 잠금")
    void anonymousBlockedOnInquiryPrefix() {
        RestAssured.given()
            .when()
                .get("/api/v1/federation/inquiries/1")
            .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    // ---- helpers ----

    private Long seedFaq(Long categoryId, String question, boolean published, int sortOrder, boolean pinned) {
        return faqRepository.save(FederationFaq.create(
                categoryId, question, "답변 본문입니다.", pinned, published, sortOrder, authorId)).getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
