package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.LocalDate;
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
 * 공개 동아리 통계(GET /clubs/stats) 인수 테스트.
 * <p>홈 히어로 문구와 카테고리 탐색 카운트가 한 응답을 함께 쓴다 — 예전처럼 목록 조회를 두 번
 * 던져 총계만 뽑던 왕복을 대체한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubStatsAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("비로그인 요청도 공개 동아리 총 수·모집중 수·카테고리별 수를 한 번에 받는다")
    void anonymousRequestReceivesPublicClubStats() throws Exception {
        Club recruitingAcademic = saveActiveClub("통계학술1", ClubCategory.ACADEMIC);
        saveActiveClub("통계학술2", ClubCategory.ACADEMIC);
        saveActiveClub("통계운동1", ClubCategory.SPORTS);
        saveOpenRecruitment(recruitingAcademic);

        RestAssured.given()
                .when().get("/api/v1/clubs/stats")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalCount", equalTo(3))
                .body("data.recruitingCount", equalTo(1))
                .body("data.categoryCounts.ACADEMIC", equalTo(2))
                .body("data.categoryCounts.SPORTS", equalTo(1));
    }

    @Test
    @DisplayName("동아리가 한 곳도 없는 카테고리도 0 으로 응답에 포함된다")
    void categoriesWithoutClubsAreReportedAsZero() throws Exception {
        saveActiveClub("통계학술만", ClubCategory.ACADEMIC);

        RestAssured.given()
                .when().get("/api/v1/clubs/stats")
                .then().statusCode(HttpStatus.OK.value())
                // 화면은 카테고리 타일을 전 종류 그리므로, 없는 키는 "0개" 가 아니라 빈칸이 된다.
                .body("data.categoryCounts.size()", equalTo(ClubCategory.values().length))
                .body("data.categoryCounts.VOLUNTEER", equalTo(0));
    }

    @Test
    @DisplayName("공개(ACTIVE) 상태가 아닌 동아리는 통계 어디에도 집계되지 않는다")
    void nonActiveClubsAreExcludedFromStats() throws Exception {
        saveActiveClub("통계공개", ClubCategory.ACADEMIC);
        // 승인 대기 상태 — 목록에 노출되지 않으므로 총계에도 잡히면 안 된다.
        clubRepository.save(Club.create(
                "통계비공개-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", null, false, null));

        RestAssured.given()
                .when().get("/api/v1/clubs/stats")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalCount", equalTo(1))
                .body("data.categoryCounts.ACADEMIC", equalTo(1));
    }

    private Club saveActiveClub(String name, ClubCategory category) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, category, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private void saveOpenRecruitment(Club club) {
        recruitmentRepository.save(Recruitment.create(
                club, "모집-" + sequence.getAndIncrement(), null,
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
    }
}
