package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.metric.service.ClubViewRateLimiter;
import com.duing.domain.club.repository.ClubRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.util.Map;
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
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 동아리 상세 조회 기록(POST /clubs/{clubId}/views) 인수 테스트.
 * <p>핵심 계약은 "같은 사람이 같은 날 같은 동아리를 몇 번 열어도 관심도는 1" 이다 — 그 보장을
 * 애플리케이션 코드가 아니라 유니크 인덱스가 하므로, 순차 재요청과 동시 요청을 모두 확인한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubViewRecordAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;
    @Autowired ClubViewRateLimiter clubViewRateLimiter;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // 리미터는 in-memory 싱글턴이라 테스트 간 카운터가 누수된다 — DB TRUNCATE 와 별개로 초기화한다.
        clubViewRateLimiter.reset();
    }

    @Test
    @DisplayName("비로그인 사용자가 방문자 키로 조회를 기록하면 204 를 반환하고 집계 이벤트가 1건 적재된다")
    void anonymousVisitorRecordsView() throws Exception {
        Club club = saveActiveClub("조회기록");

        recordView(club.getId(), "visitor-" + sequence.incrementAndGet())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(countEvents(club.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("같은 방문자가 같은 날 같은 동아리를 여러 번 열어도 집계 이벤트는 1건만 남는다")
    void repeatedViewsFromSameVisitorAreCountedOnce() throws Exception {
        Club club = saveActiveClub("중복조회");
        String visitorKey = "visitor-" + sequence.incrementAndGet();

        for (int attempt = 0; attempt < 5; attempt++) {
            recordView(club.getId(), visitorKey)
                    .then().statusCode(HttpStatus.NO_CONTENT.value());
        }

        assertThat(countEvents(club.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("서로 다른 방문자가 같은 동아리를 열면 방문자 수만큼 집계 이벤트가 쌓인다")
    void viewsFromDifferentVisitorsAreCountedSeparately() throws Exception {
        Club club = saveActiveClub("서로다른방문자");

        recordView(club.getId(), "visitor-A-" + sequence.incrementAndGet());
        recordView(club.getId(), "visitor-B-" + sequence.incrementAndGet());
        recordView(club.getId(), "visitor-C-" + sequence.incrementAndGet());

        assertThat(countEvents(club.getId())).isEqualTo(3);
    }

    @Test
    @DisplayName("같은 방문자의 조회 기록이 동시에 도착해도 집계 이벤트는 1건만 남는다")
    void concurrentViewsFromSameVisitorAreCountedOnce() throws Exception {
        Club club = saveActiveClub("동시조회");
        String visitorKey = "visitor-" + sequence.incrementAndGet();
        int concurrency = 10;

        CountDownLatch startLine = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(concurrency);
        ExecutorService executor = Executors.newFixedThreadPool(concurrency);
        try {
            for (int worker = 0; worker < concurrency; worker++) {
                executor.submit(() -> {
                    try {
                        startLine.await();
                        recordView(club.getId(), visitorKey);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                    } finally {
                        finished.countDown();
                    }
                });
            }
            startLine.countDown();
            assertThat(finished.await(30, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
        }

        assertThat(countEvents(club.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("존재하지 않는 동아리의 조회를 기록하면 404 를 반환한다")
    void recordingViewForUnknownClubReturnsNotFound() {
        recordView(99_999_999L, "visitor-" + sequence.incrementAndGet())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("공개(ACTIVE) 상태가 아닌 동아리의 조회를 기록하면 404 를 반환하고 이벤트가 쌓이지 않는다")
    void recordingViewForNonActiveClubReturnsNotFound() {
        // 승인 대기 상태 — 목록·상세에 노출되지 않으므로 관심도 집계 대상도 아니다.
        Club pending = clubRepository.save(Club.create(
                "비공개-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", null, false, null));

        recordView(pending.getId(), "visitor-" + sequence.incrementAndGet())
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(countEvents(pending.getId())).isZero();
    }

    @Test
    @DisplayName("방문자 키 없이 조회 기록을 요청하면 400 을 반환한다")
    void recordingViewWithoutVisitorKeyReturnsBadRequest() throws Exception {
        Club club = saveActiveClub("키누락");

        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("visitorKey", " "))
                .when().post("/api/v1/clubs/{clubId}/views", club.getId())
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(countEvents(club.getId())).isZero();
    }

    private io.restassured.response.Response recordView(Long clubId, String visitorKey) {
        return RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("visitorKey", visitorKey))
                .when().post("/api/v1/clubs/{clubId}/views", clubId);
    }

    private int countEvents(Long clubId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM club_view_event WHERE club_id = ?", Integer.class, clubId);
        return count == null ? 0 : count;
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
