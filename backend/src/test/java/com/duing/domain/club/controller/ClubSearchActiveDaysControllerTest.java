package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
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
class ClubSearchActiveDaysControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() { RestAssured.port = port; }

    @Test
    @DisplayName("단일 요일 — ?activeDays=MONDAY 는 월요일 활동 동아리만 반환한다")
    void singleDayFilterReturnsMatchingClubsOnly() throws Exception {
        Club monClub = saveActiveClub("activeDaysSingleMon", "MONDAY,FRIDAY");
        Club tueClub = saveActiveClub("activeDaysSingleTue", "TUESDAY");

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&keyword=activeDaysSingle&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(monClub.getName()))
                .body("data.content.name", not(hasItem(tueClub.getName())));
    }

    @Test
    @DisplayName("다중 요일 OR — ?activeDays=MONDAY&activeDays=WEDNESDAY 는 월 또는 수 활동 동아리를 반환한다")
    void multipleDaysFilterReturnsOrUnion() throws Exception {
        Club bothClub = saveActiveClub("activeDaysOrBoth", "MONDAY,WEDNESDAY");
        Club monOnly = saveActiveClub("activeDaysOrMon", "MONDAY");
        Club wedOnly = saveActiveClub("activeDaysOrWed", "WEDNESDAY");
        Club neither = saveActiveClub("activeDaysOrNeither", "TUESDAY,THURSDAY");

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&activeDays=WEDNESDAY&keyword=activeDaysOr&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(bothClub.getName()))
                .body("data.content.name", hasItem(monOnly.getName()))
                .body("data.content.name", hasItem(wedOnly.getName()))
                .body("data.content.name", not(hasItem(neither.getName())));
    }

    @Test
    @DisplayName("중복 파라미터 — ?activeDays=MONDAY&activeDays=MONDAY 는 단일 ?activeDays=MONDAY 와 동일하다")
    void duplicateParamsBehaveLikeSingle() throws Exception {
        Club monClub = saveActiveClub("activeDaysDupMon", "MONDAY");
        Club tueClub = saveActiveClub("activeDaysDupTue", "TUESDAY");

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&activeDays=MONDAY&keyword=activeDaysDup&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(monClub.getName()))
                .body("data.content.name", not(hasItem(tueClub.getName())))
                .body("data.totalElements", equalTo(1));
    }

    @Test
    @DisplayName("active_days NULL 동아리 — 필터 적용 시 제외된다")
    void nullActiveDaysExcludedFromFilteredResults() throws Exception {
        Club monClub = saveActiveClub("activeDaysNullMon", "MONDAY");
        Club nullClub = saveActiveClub("activeDaysNullMiss", null);

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&keyword=activeDaysNull&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(monClub.getName()))
                .body("data.content.name", not(hasItem(nullClub.getName())));
    }

    @Test
    @DisplayName("잘못된 enum 값 — ?activeDays=MOONDAY 는 400 으로 응답한다")
    void invalidEnumReturnsBadRequest() {
        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MOONDAY")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("7개 전체 선택 — 미적용과 동일 결과셋 (NULL 동아리 포함)")
    void sevenDaysSelectedBehavesLikeNoFilter() throws Exception {
        Club monClub = saveActiveClub("activeDaysAllMon", "MONDAY");
        Club nullClub = saveActiveClub("activeDaysAllMiss", null);

        RestAssured.given()
                .when().get("/api/v1/clubs"
                        + "?activeDays=MONDAY&activeDays=TUESDAY&activeDays=WEDNESDAY"
                        + "&activeDays=THURSDAY&activeDays=FRIDAY&activeDays=SATURDAY&activeDays=SUNDAY"
                        + "&keyword=activeDaysAll&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(monClub.getName()))
                .body("data.content.name", hasItem(nullClub.getName()));
    }

    @Test
    @DisplayName("다른 필터와 AND 결합 — category=SPORTS & activeDays=MONDAY 는 두 조건 모두 만족하는 동아리만")
    void combinesWithOtherFiltersAsAnd() throws Exception {
        Club sportsMon = saveActiveSportsClub("activeDaysAndSportsMon", "MONDAY");
        Club sportsTue = saveActiveSportsClub("activeDaysAndSportsTue", "TUESDAY");
        Club academicMon = saveActiveClub("activeDaysAndAcademicMon", "MONDAY");

        RestAssured.given()
                .when().get("/api/v1/clubs?activeDays=MONDAY&category=SPORTS&keyword=activeDaysAnd&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(sportsMon.getName()))
                .body("data.content.name", not(hasItem(sportsTue.getName())))
                .body("data.content.name", not(hasItem(academicMon.getName())));
    }

    private Club saveActiveClub(String name, String activeDaysCsv) throws Exception {
        return saveActiveClub(name, ClubCategory.ACADEMIC, activeDaysCsv);
    }

    private Club saveActiveSportsClub(String name, String activeDaysCsv) throws Exception {
        return saveActiveClub(name, ClubCategory.SPORTS, activeDaysCsv);
    }

    private Club saveActiveClub(String name, ClubCategory category, String activeDaysCsv) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, category, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);

        Field activeDaysField = Club.class.getDeclaredField("activeDays");
        activeDaysField.setAccessible(true);
        activeDaysField.set(created, activeDaysCsv);

        return clubRepository.save(created);
    }
}
