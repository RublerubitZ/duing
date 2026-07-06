package com.duing.domain.federation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.entity.FederationFaqFeedback;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqFeedbackRepository;
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
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
class FederationFaqFeedbackAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired FederationFaqRepository faqRepository;
    @Autowired FederationFaqCategoryRepository categoryRepository;
    @Autowired FederationFaqFeedbackRepository feedbackRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long authorId;
    private Long categoryId;
    private Long publishedFaqId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        authorId = saveUser(UserRole.ADMIN).getId();
        categoryId = categoryRepository.save(FederationFaqCategory.create("테스트-피드백" + sequence.incrementAndGet(), 0)).getId();
        publishedFaqId = seedFaq("피드백 대상 질문", true);
    }

    @Test
    @DisplayName("비로그인 사용자가 sessionKey 로 피드백을 제출하면 204 를 반환한다")
    void anonymousSubmitsFeedbackWithSessionKey() {
        RestAssured.given()
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", true, "sessionKey", "session-anon-1"))
            .when()
                .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        FederationFaqFeedback saved = feedbackRepository
                .findByFaqIdAndSessionKey(publishedFaqId, "session-anon-1")
                .orElseThrow();
        assertThat(saved.isHelpful()).isTrue();
        assertThat(saved.getUserId()).isNull();
    }

    @Test
    @DisplayName("같은 sessionKey 로 재제출하면 새 행이 생기지 않고 값만 갱신된다")
    void anonymousResubmitUpdatesExistingFeedback() {
        String sessionKey = "session-anon-2";
        RestAssured.given()
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", true, "sessionKey", sessionKey))
            .when()
                .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", false, "sessionKey", sessionKey))
            .when()
                .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(feedbackRepository.count()).isEqualTo(1);
        FederationFaqFeedback updated = feedbackRepository
                .findByFaqIdAndSessionKey(publishedFaqId, sessionKey)
                .orElseThrow();
        assertThat(updated.isHelpful()).isFalse();
    }

    @Test
    @DisplayName("로그인 사용자가 제출·재제출하면 userId 로 갱신된다(sessionKey 는 무시)")
    void loggedInUserSubmitsAndResubmitsFeedback() {
        User loginUser = saveUser(UserRole.STUDENT);
        String accessToken = jwtTokenProvider.createToken(loginUser.getId(), loginUser.getRole().name());

        RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", true, "sessionKey", "should-be-ignored"))
            .when()
                .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", false))
            .when()
                .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(feedbackRepository.count()).isEqualTo(1);
        FederationFaqFeedback updated = feedbackRepository
                .findByFaqIdAndUserId(publishedFaqId, loginUser.getId())
                .orElseThrow();
        assertThat(updated.isHelpful()).isFalse();
        assertThat(updated.getSessionKey()).isNull();
    }

    @Test
    @DisplayName("비로그인 사용자가 sessionKey 없이 제출하면 400 을 반환한다")
    void anonymousWithoutSessionKeyReturns400() {
        RestAssured.given()
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", true))
            .when()
                .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", equalTo("세션 키는 필수 입력값입니다."));
    }

    @Test
    @DisplayName("미발행 FAQ 에 피드백을 제출하면 404 를 반환한다")
    void unpublishedFaqReturns404() {
        Long unpublishedFaqId = seedFaq("미발행 질문", false);

        RestAssured.given()
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", true, "sessionKey", "session-unpublished"))
            .when()
                .post("/api/v1/federation/faqs/" + unpublishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("존재하지 않는 FAQ 에 피드백을 제출하면 404 를 반환한다")
    void nonExistentFaqReturns404() {
        RestAssured.given()
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", true, "sessionKey", "session-missing"))
            .when()
                .post("/api/v1/federation/faqs/999999/feedback")
            .then()
                .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("로그인·비로그인 사용자가 같은 FAQ 에 각각 제출하면 독립된 2건으로 쌓인다")
    void loggedInAndAnonymousFeedbacksAreIndependent() {
        User loginUser = saveUser(UserRole.STUDENT);
        String accessToken = jwtTokenProvider.createToken(loginUser.getId(), loginUser.getRole().name());

        RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", true))
            .when()
                .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
            .contentType(ContentType.JSON)
            .body(Map.of("helpful", false, "sessionKey", "session-independent"))
            .when()
                .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
            .then()
                .statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(feedbackRepository.count()).isEqualTo(2);
        assertThat(feedbackRepository.findByFaqIdAndUserId(publishedFaqId, loginUser.getId())).isPresent();
        assertThat(feedbackRepository.findByFaqIdAndSessionKey(publishedFaqId, "session-independent")).isPresent();
    }

    @Test
    @DisplayName("같은 sessionKey 로 두 요청이 동시에 최초 제출해도 둘 다 성공하고 최종 1건만 남는다")
    void concurrentFirstSubmissionsWithSameSessionKeyResultInSingleRow() throws Exception {
        // find→분기→save/update + 23505 catch 구조였을 때는, 진 쪽 트랜잭션이 실패한 insert 를
        // 액션 큐에 남긴 채 조용히 반환해 커밋 시점 재flush 가 abort 된 PG 트랜잭션에서 재시도되며
        // 500 이 났다(codex High). ON CONFLICT DO UPDATE 원자 upsert 로 교체한 뒤에는 두 요청 모두
        // 정상 2xx 로 끝나고 행은 정확히 1건이어야 한다.
        String sessionKey = "session-concurrent-" + sequence.incrementAndGet();
        int threadCount = 2;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threadCount);
        List<Integer> statusCodes = new CopyOnWriteArrayList<>();
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);

        try {
            pool.submit(() -> submitConcurrently(start, done, statusCodes, sessionKey, true));
            pool.submit(() -> submitConcurrently(start, done, statusCodes, sessionKey, false));
            start.countDown();
            assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdown();
            assertThat(pool.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }

        assertThat(statusCodes).hasSize(2);
        assertThat(statusCodes).allMatch(statusCode -> statusCode == HttpStatus.NO_CONTENT.value());

        // 어느 요청의 helpful 값이 남는지는 인터리빙에 따라 달라지므로 단언하지 않는다
        // (TransferLeaderConcurrencyTest 전례) — 핵심 불변식은 "해당 identity 로 행이 정확히 1건".
        assertThat(feedbackRepository.count()).isEqualTo(1);
        assertThat(feedbackRepository.findByFaqIdAndSessionKey(publishedFaqId, sessionKey)).isPresent();
    }

    private void submitConcurrently(CountDownLatch start, CountDownLatch done, List<Integer> statusCodes,
                                     String sessionKey, boolean helpful) {
        try {
            start.await();
            int statusCode = RestAssured.given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("helpful", helpful, "sessionKey", sessionKey))
                    .when()
                        .post("/api/v1/federation/faqs/" + publishedFaqId + "/feedback")
                    .then()
                        .extract().statusCode();
            statusCodes.add(statusCode);
        } catch (InterruptedException interruptedException) {
            Thread.currentThread().interrupt();
        } finally {
            done.countDown();
        }
    }

    // ---- helpers ----

    private Long seedFaq(String question, boolean published) {
        return faqRepository.save(FederationFaq.create(
                categoryId, question, "답변 본문입니다.", false, published, 0, authorId)).getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
