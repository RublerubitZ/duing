package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.metric.service.ClubMetricService;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubInterestPolicy;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
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
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 관심도순(sort=INTEREST) 정렬 검증 — 홈 "관심도가 높은 동아리" 섹션이 쓰는 정렬이다.
 * <p>가장 중요한 계약은 콜드 스타트다. 집계 배포 직후·방학처럼 조회가 전무한 구간에서 이 정렬이
 * 무너지면 홈 첫 화면이 무작위로 보이므로, 관심도 0 구간에서는 기존 인기순과 완전히 같아야 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubInterestSortTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;
    @Autowired ClubMetricService clubMetricService;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("관심도 데이터가 전혀 없으면 관심도순 결과가 인기순 결과와 완전히 같다")
    void interestSortFallsBackToPopularOrderWhenNoDataExists() throws Exception {
        saveActiveClub("콜드스타트가");
        saveActiveClub("콜드스타트나");
        saveActiveClub("콜드스타트다");
        clubMetricService.refreshAll();

        List<String> popularOrder = fetchNames("POPULAR", "콜드스타트");
        List<String> interestOrder = fetchNames("INTEREST", "콜드스타트");

        assertThat(interestOrder).hasSize(3);
        assertThat(interestOrder).containsExactlyElementsOf(popularOrder);
    }

    @Test
    @DisplayName("최근 조회가 많은 동아리가 관심도순 첫 번째로 반환된다")
    void mostViewedClubComesFirstInInterestSort() throws Exception {
        Club rarelyViewed = saveActiveClub("관심도정렬가");
        Club popularlyViewed = saveActiveClub("관심도정렬나");
        LocalDate today = LocalDate.now(clock);
        insertViewEvent(rarelyViewed.getId(), "visitor-1", today);
        for (int visitor = 0; visitor < 5; visitor++) {
            insertViewEvent(popularlyViewed.getId(), "visitor-many-" + visitor, today);
        }
        clubMetricService.refreshAll();

        RestAssured.given()
                .when().get("/api/v1/clubs?sort=INTEREST&keyword=관심도정렬")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].name", equalTo(popularlyViewed.getName()))
                .body("data.content[0].weeklyInterestCount", equalTo(5));
    }

    @Test
    @DisplayName("주간 순방문자 수는 목록 응답에 실려 나가고, 조회 이력이 없으면 0 으로 내려간다")
    void weeklyInterestCountIsExposedAndDefaultsToZero() throws Exception {
        Club neverViewed = saveActiveClub("관심도미조회");
        clubMetricService.refreshAll();

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword={keyword}", neverViewed.getName())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].weeklyInterestCount", equalTo(0));
    }

    @Test
    @DisplayName("집계 배치가 아직 돌지 않아 지표 행이 없는 동아리도 관심도순 결과에서 빠지지 않는다")
    void clubWithoutMetricRowStillAppearsInInterestSort() throws Exception {
        // refreshAll 을 부르지 않아 club_metric 행 자체가 없는 상태 — left join 이 아니면 결과에서 사라진다.
        Club justCreated = saveActiveClub("관심도무지표");

        RestAssured.given()
                .when().get("/api/v1/clubs?sort=INTEREST&keyword={keyword}", justCreated.getName())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1))
                .body("data.content[0].weeklyInterestCount", equalTo(0));
    }

    private List<String> fetchNames(String sort, String keyword) {
        return RestAssured.given()
                .when().get("/api/v1/clubs?sort={sort}&keyword={keyword}", sort, keyword)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getList("data.content.name", String.class);
    }

    private void insertViewEvent(Long clubId, String visitorKey, LocalDate eventDate) {
        jdbcTemplate.update(
                "INSERT INTO club_view_event (club_id, visitor_hash, event_date) VALUES (?, ?, ?)",
                clubId, ClubInterestPolicy.visitorHash(visitorKey), eventDate);
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
