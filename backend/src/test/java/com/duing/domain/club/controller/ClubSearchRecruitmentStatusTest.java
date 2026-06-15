package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubSearchRecruitmentStatusTest extends IntegrationTestBase {

    @LocalServerPort int port;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() { RestAssured.port = port; }

    @Test
    @DisplayName("recruitmentStatus=AVAILABLE 이면 OPEN/ALWAYS_OPEN 동아리만 반환된다")
    void availableFilterReturnsOpenAndAlwaysOpen() throws Exception {
        Club openClub = saveActiveClub("availOpen");
        Club alwaysClub = saveActiveClub("availAlways");
        Club upcomingClub = saveActiveClub("availUpcoming");
        Club closedClub = saveActiveClub("availClosed");

        saveOpenRecruitment(openClub, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveOpenRecruitment(alwaysClub, LocalDate.now().minusDays(2), null);
        saveOpenRecruitment(upcomingClub, LocalDate.now().plusDays(5), LocalDate.now().plusDays(10));
        saveClosedRecruitment(closedClub, LocalDate.now().minusDays(10), LocalDate.now().minusDays(1));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruitmentStatus=AVAILABLE&keyword=avail&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(openClub.getName()))
                .body("data.content.name", hasItem(alwaysClub.getName()))
                .body("data.content.name", not(hasItem(upcomingClub.getName())))
                .body("data.content.name", not(hasItem(closedClub.getName())));
    }

    @Test
    @DisplayName("recruitmentStatus=UPCOMING 이면 시작 전 모집을 가진 동아리만 반환된다")
    void upcomingFilterReturnsFuturePending() throws Exception {
        Club futureClub = saveActiveClub("upcomingFuture");
        Club openClub = saveActiveClub("upcomingOpen");

        saveOpenRecruitment(futureClub, LocalDate.now().plusDays(3), LocalDate.now().plusDays(10));
        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(5));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruitmentStatus=UPCOMING&keyword=upcoming&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(futureClub.getName()))
                .body("data.content.name", not(hasItem(openClub.getName())));
    }

    @Test
    @DisplayName("recruitmentStatus=CLOSED 이면 마감 이력만 있고 활성 모집이 없는 동아리만 반환된다")
    void closedFilterExcludesClubsWithActiveRecruitment() throws Exception {
        Club bothClub = saveActiveClub("closedBoth");
        Club closedOnlyClub = saveActiveClub("closedOnly");
        Club noneClub = saveActiveClub("closedNone");

        saveClosedRecruitment(bothClub, LocalDate.now().minusDays(20), LocalDate.now().minusDays(10));
        saveOpenRecruitment(bothClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(5));
        saveClosedRecruitment(closedOnlyClub, LocalDate.now().minusDays(20), LocalDate.now().minusDays(5));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruitmentStatus=CLOSED&keyword=closed&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(closedOnlyClub.getName()))
                .body("data.content.name", not(hasItem(bothClub.getName())))
                .body("data.content.name", not(hasItem(noneClub.getName())));
    }

    @Test
    @DisplayName("recruiting=true 단독은 AVAILABLE 과 동일하게 처리된다 (하위호환)")
    void legacyRecruitingTrueMapsToAvailable() throws Exception {
        Club openClub = saveActiveClub("legacyOpen");
        Club closedClub = saveActiveClub("legacyClosed");

        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(5));
        saveClosedRecruitment(closedClub, LocalDate.now().minusDays(10), LocalDate.now().minusDays(1));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruiting=true&keyword=legacy&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(openClub.getName()))
                .body("data.content.name", not(hasItem(closedClub.getName())));
    }

    @Test
    @DisplayName("recruitmentStatus 와 recruiting 가 동시에 지정되면 recruitmentStatus 가 우선한다")
    void explicitRecruitmentStatusOverridesLegacyRecruiting() throws Exception {
        Club upcomingClub = saveActiveClub("overrideUpcoming");
        Club openClub = saveActiveClub("overrideOpen");

        saveOpenRecruitment(upcomingClub, LocalDate.now().plusDays(3), LocalDate.now().plusDays(10));
        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(5));

        RestAssured.given()
                .when().get("/api/v1/clubs?recruiting=true&recruitmentStatus=UPCOMING&keyword=override&size=50")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.name", hasItem(upcomingClub.getName()))
                .body("data.content.name", not(hasItem(openClub.getName())));
    }

    @Test
    @DisplayName("활성 모집이 있는 동아리는 activeRecruitment 가 OPEN 상태로 응답에 포함된다")
    void activeRecruitmentEmbeddedInResponse() throws Exception {
        Club openClub = saveActiveClub("embedOpen");
        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=embedOpen&size=10")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].activeRecruitment", notNullValue())
                .body("data.content[0].activeRecruitment.displayStatus", equalTo("OPEN"))
                .body("data.content[0].activeRecruitment.endDate", notNullValue());
    }

    @Test
    @DisplayName("상시모집(endDate=null) 동아리는 activeRecruitment.displayStatus=ALWAYS_OPEN, endDate=null 로 응답된다")
    void alwaysOpenRecruitmentEmbedded() throws Exception {
        Club alwaysClub = saveActiveClub("embedAlways");
        saveOpenRecruitment(alwaysClub, LocalDate.now().minusDays(2), null);

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=embedAlways&size=10")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].activeRecruitment.displayStatus", equalTo("ALWAYS_OPEN"))
                .body("data.content[0].activeRecruitment.endDate", nullValue());
    }

    @Test
    @DisplayName("모집 이력이 없는 동아리는 activeRecruitment 가 null 이다")
    void clubWithoutRecruitmentHasNullActive() throws Exception {
        Club bareClub = saveActiveClub("embedBare");

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=embedBare&size=10")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].activeRecruitment", nullValue());
    }

    @Test
    @DisplayName("기본 정렬은 OPEN > ALWAYS_OPEN > UPCOMING > CLOSED > 모집없음 순으로 동아리를 노출한다")
    void defaultSortGroupsByRecruitmentStatus() throws Exception {
        Club bareClub = saveActiveClub("sortGroupBare");
        Club closedClub = saveActiveClub("sortGroupClosed");
        Club upcomingClub = saveActiveClub("sortGroupUpcoming");
        Club alwaysClub = saveActiveClub("sortGroupAlways");
        Club openClub = saveActiveClub("sortGroupOpen");

        saveClosedRecruitment(closedClub, LocalDate.now().minusDays(20), LocalDate.now().minusDays(5));
        saveOpenRecruitment(upcomingClub, LocalDate.now().plusDays(5), LocalDate.now().plusDays(15));
        saveOpenRecruitment(alwaysClub, LocalDate.now().minusDays(3), null);
        saveOpenRecruitment(openClub, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));

        RestAssured.given()
                .when().get("/api/v1/clubs?keyword=sortGroup&size=10")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(5))
                .body("data.content[0].name", equalTo(openClub.getName()))
                .body("data.content[1].name", equalTo(alwaysClub.getName()))
                .body("data.content[2].name", equalTo(upcomingClub.getName()))
                .body("data.content[3].name", equalTo(closedClub.getName()))
                .body("data.content[4].name", equalTo(bareClub.getName()));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private Recruitment saveOpenRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        return recruitmentRepository.save(created);
    }

    private Recruitment saveClosedRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        created.close();
        return recruitmentRepository.save(created);
    }
}