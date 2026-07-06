package com.duing.domain.federation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.entity.FederationFaqSearchMiss;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
import com.duing.domain.federation.repository.FederationFaqSearchMissRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

/**
 * FAQ 무결과 검색어 집계 기록 인수 테스트. 실PG(TestContainers) 경유로 실행해
 * {@code GeneralFederationFaqService} readOnly 트랜잭션 안에서 기록을 시도하면 실PG 에서만
 * 재현되는 커밋 실패(readOnly 함정)의 회귀를 잠근다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FederationFaqSearchMissAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired FederationFaqRepository faqRepository;
    @Autowired FederationFaqCategoryRepository categoryRepository;
    @Autowired FederationFaqSearchMissRepository searchMissRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long categoryId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Long authorId = saveUser(UserRole.ADMIN).getId();
        categoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-무결과" + sequence.incrementAndGet(), 0)).getId();
        seedFaq(authorId, "동아리 등록 절차");
    }

    @Test
    @DisplayName("무결과 검색어로 검색하면 집계 행이 1건 생성되고 miss_count는 1이다")
    void searchWithNoResultsRecordsSingleRowWithCountOne() {
        RestAssured.given()
            .queryParam("keyword", "존재하지않는검색어")
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(0));

        List<FederationFaqSearchMiss> rows = searchMissRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getKeyword()).isEqualTo("존재하지않는검색어");
        assertThat(rows.get(0).getMissCount()).isEqualTo(1L);
    }

    @Test
    @DisplayName("같은 무결과 검색어를 재검색하면 행은 그대로 1건이고 miss_count만 2로 증가한다")
    void searchingSameMissingKeywordTwiceIncrementsCount() {
        String keyword = "존재하지않는검색어2";

        searchFaqs(keyword);
        searchFaqs(keyword);

        List<FederationFaqSearchMiss> rows = searchMissRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getMissCount()).isEqualTo(2L);
    }

    @Test
    @DisplayName("대소문자·공백 변형 검색어는 정규화되어 같은 행으로 집계된다")
    void caseAndWhitespaceVariantsNormalizeToSameRow() {
        searchFaqs(" Abc ");
        searchFaqs("abc");

        List<FederationFaqSearchMiss> rows = searchMissRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getKeyword()).isEqualTo("abc");
        assertThat(rows.get(0).getMissCount()).isEqualTo(2L);
    }

    @Test
    @DisplayName("결과가 있는 검색은 무결과 검색어로 기록되지 않는다")
    void searchWithResultsIsNotRecorded() {
        RestAssured.given()
            .queryParam("keyword", "등록")
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1));

        assertThat(searchMissRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("keyword 없이 목록만 조회하면 무결과 검색어로 기록되지 않는다")
    void listingWithoutKeywordIsNotRecorded() {
        RestAssured.given()
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value());

        assertThat(searchMissRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("FAQ에 있는 키워드는 앞뒤 공백·대소문자 변형으로 검색해도 결과가 나와 무결과로 기록되지 않는다")
    void keywordWithSurroundingWhitespaceAndCaseVariantStillMatchesExistingFaq() {
        Long authorId = saveUser(UserRole.ADMIN).getId();
        seedFaq(authorId, "MT 일정 안내");

        RestAssured.given()
            .queryParam("keyword", " mt ")
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1));

        assertThat(searchMissRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("연속 공백이 낀 검색어도 압축되어 검색되므로 결과가 있으면 기록되지 않는다")
    void keywordWithRepeatedInnerWhitespaceIsCompactedBeforeSearch() {
        RestAssured.given()
            .queryParam("keyword", "동아리  등록")
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1));

        assertThat(searchMissRepository.findAll()).isEmpty();
    }

    // ---- helpers ----

    private void searchFaqs(String keyword) {
        RestAssured.given()
            .queryParam("keyword", keyword)
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value());
    }

    private Long seedFaq(Long authorId, String question) {
        return faqRepository.save(FederationFaq.create(
                categoryId, question, "답변 본문입니다.", false, true, 0, authorId)).getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
