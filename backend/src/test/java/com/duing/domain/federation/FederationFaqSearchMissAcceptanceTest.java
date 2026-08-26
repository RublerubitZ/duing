package com.duing.domain.federation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.entity.FederationFaqSearchMiss;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
import com.duing.domain.federation.repository.FederationFaqSearchMissRepository;
import com.duing.domain.federation.service.FederationFaqSearchMissRateLimiter;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
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
import org.springframework.http.HttpHeaders;
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
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired FederationFaqRepository faqRepository;
    @Autowired FederationFaqCategoryRepository categoryRepository;
    @Autowired FederationFaqSearchMissRepository searchMissRepository;
    @Autowired FederationFaqSearchMissRateLimiter searchMissRateLimiter;

    // 무결과 기록의 분당 한도(FederationFaqSearchMissRateLimiter.PER_MINUTE_LIMIT = 10, package-private 라
    // 직접 참조 불가)를 확실히 넘기는 고정 횟수. 정확한 경계값은 FederationFaqSearchMissRateLimiterTest 가 검증한다.
    private static final int MISSED_SEARCHES_OVER_LIMIT = 13;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long categoryId;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // 리미터는 in-memory 싱글턴이라 테스트 간 창이 누수된다 — DB TRUNCATE 와 별개로 초기화한다.
        searchMissRateLimiter.reset();
        User admin = saveUser(UserRole.ADMIN);
        User student = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        categoryId = categoryRepository
                .save(FederationFaqCategory.create("테스트-무결과" + sequence.incrementAndGet(), 0)).getId();
        seedFaq(admin.getId(), "동아리 등록 절차");
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

    @Test
    @DisplayName("NBSP 등 유니코드 공백이 낀 검색어도 일반 공백으로 정규화되어 결과가 있으면 기록되지 않는다")
    void keywordWithUnicodeWhitespaceIsNormalizedBeforeSearch() {
        RestAssured.given()
            .queryParam("keyword", "동아리\u00A0등록")  // NBSP — Java \s로는 안 잡히는 유니코드 공백
            .when()
                .get("/api/v1/federation/faqs")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1));

        assertThat(searchMissRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("무결과 검색어 목록은 miss_count 내림차순으로 정렬되어 반환된다")
    void searchMissesAreSortedByMissCountDescending() {
        seedSearchMisses();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/faq-search-misses")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content[0].keyword", equalTo("미검색어셋"))
                .body("data.content[0].missCount", equalTo(3))
                .body("data.content[0].lastSearchedAt", notNullValue())
                .body("data.content[1].keyword", equalTo("미검색어둘"))
                .body("data.content[1].missCount", equalTo(2))
                .body("data.content[2].keyword", equalTo("미검색어하나"))
                .body("data.content[2].missCount", equalTo(1));
    }

    @Test
    @DisplayName("무결과 검색어 목록이 페이지네이션된다")
    void searchMissesArePaginated() {
        seedSearchMisses();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("page", 0)
                .queryParam("size", 2)
            .when()
                .get("/api/v1/admin/federation/faq-search-misses")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(2))
                .body("data.totalElements", equalTo(3));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("page", 1)
                .queryParam("size", 2)
            .when()
                .get("/api/v1/admin/federation/faq-search-misses")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1));
    }

    @Test
    @DisplayName("miss_count가 같으면 마지막 검색 시각이 최근인 검색어가 먼저 온다")
    void tiedMissCountsAreOrderedByLastSearchedAtDescending() {
        // 순차 HTTP 호출이라 뒤 키워드의 last_searched_at이 항상 더 최근이다 (PG NOW()는 트랜잭션별 시각이라 결정적).
        searchFaqs("동률키워드하나");
        searchFaqs("동률키워드둘");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .when()
                .get("/api/v1/admin/federation/faq-search-misses")
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.content[0].keyword", equalTo("동률키워드둘"))
                .body("data.content[0].missCount", equalTo(1))
                .body("data.content[1].keyword", equalTo("동률키워드하나"))
                .body("data.content[1].missCount", equalTo(1));
    }

    @Test
    @DisplayName("ADMIN이 아닌 사용자가 무결과 검색어 목록을 조회하면 403이 반환된다")
    void nonAdminCannotViewSearchMisses() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
            .when()
                .get("/api/v1/admin/federation/faq-search-misses")
            .then()
                .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("무결과 검색을 분당 한도보다 많이 반복해도 검색 응답은 200 이고 초과분만 집계에서 빠진다")
    void missedSearchesOverLimitStillReturn200AndOnlySkipRecording() {
        // 여기서 429 를 던지면 공개 FAQ 검색 자체가 죽는다 — 방어책이 기능을 파괴해선 안 된다.
        for (int attempt = 0; attempt < MISSED_SEARCHES_OVER_LIMIT; attempt++) {
            RestAssured.given()
                    .queryParam("keyword", "무제한생성키워드" + attempt)
                .when()
                    .get("/api/v1/federation/faqs")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(0));
        }

        // 서로 다른 키워드마다 새 행이 생기는 축을 창이 캡한다 — 시도 횟수보다 적게 쌓여야 한다.
        assertThat(searchMissRepository.count()).isPositive();
        assertThat(searchMissRepository.count()).isLessThan(MISSED_SEARCHES_OVER_LIMIT);
    }

    @Test
    @DisplayName("결과가 있는 검색은 무결과 기록 한도를 소모하지 않는다")
    void searchesWithResultsDoNotConsumeRecordingLimit() {
        // 판정 순서(resultCount → 정규화 → 리미터)를 어기면 정상 검색이 예산을 태워 무결과 기록이
        // 조용히 멈춘다 — 알림 없는 신호 유실이라 여기서 잠근다.
        for (int attempt = 0; attempt < MISSED_SEARCHES_OVER_LIMIT + 5; attempt++) {
            RestAssured.given()
                    .queryParam("keyword", "등록")
                .when()
                    .get("/api/v1/federation/faqs")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(1));
        }

        searchFaqs("예산소모여부확인키워드");

        List<FederationFaqSearchMiss> rows = searchMissRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getKeyword()).isEqualTo("예산소모여부확인키워드");
    }

    // ---- helpers ----

    // 서로 다른 무결과 키워드 3개를 각각 3회/1회/2회 검색해 miss_count를 3/1/2로 시딩한다.
    private void seedSearchMisses() {
        searchFaqs("미검색어셋");
        searchFaqs("미검색어셋");
        searchFaqs("미검색어셋");
        searchFaqs("미검색어하나");
        searchFaqs("미검색어둘");
        searchFaqs("미검색어둘");
    }

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
                "20" + seq, "테스터" + seq,
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
