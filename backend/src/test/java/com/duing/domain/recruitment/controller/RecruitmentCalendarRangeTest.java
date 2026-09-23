package com.duing.domain.recruitment.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItems;

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
import java.time.YearMonth;
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
class RecruitmentCalendarRangeTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // 상대 날짜 — 다른 테스트의 "오늘 근처" 시드와 겹치지 않도록 먼 미래의 월 경계를 쓴다.
    private final YearMonth firstMonth = YearMonth.from(LocalDate.now()).plusMonths(40);
    private final YearMonth secondMonth = firstMonth.plusMonths(1);

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("from·to 범위가 두 달에 걸치면 양쪽 달의 모집을 한 번에 반환한다")
    void rangeSpanningTwoMonthsReturnsRecruitmentsFromBothMonths() throws Exception {
        // 동아리당 OPEN 모집은 1건(uk_recruitment_club_active)이라 달마다 동아리를 따로 둔다.
        Recruitment firstMonthRecruitment = recruitmentRepository.save(Recruitment.create(
                saveActiveClub("앞달동아리"), "앞달모집", null, firstMonth.atEndOfMonth().minusDays(5), firstMonth.atEndOfMonth().minusDays(2), 5));
        Recruitment secondMonthRecruitment = recruitmentRepository.save(Recruitment.create(
                saveActiveClub("뒷달동아리"), "뒷달모집", null, secondMonth.atDay(3), secondMonth.atDay(8), 5));

        RestAssured.given()
                .queryParam("from", firstMonth.atDay(20).toString())
                .queryParam("to", secondMonth.atDay(15).toString())
                .when().get("/api/v1/recruitments")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.id", hasItems(
                        firstMonthRecruitment.getId().intValue(), secondMonthRecruitment.getId().intValue()));
    }

    @Test
    @DisplayName("yearMonth 와 from 을 함께 주면 400 이다")
    void yearMonthWithFromIsRejected() {
        RestAssured.given()
                .queryParam("yearMonth", firstMonth.toString())
                .queryParam("from", firstMonth.atDay(1).toString())
                .when().get("/api/v1/recruitments")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("from 만 주거나 조회 기간이 없으면 400 이다")
    void partialOrMissingRangeIsRejected() {
        RestAssured.given()
                .queryParam("from", firstMonth.atDay(1).toString())
                .when().get("/api/v1/recruitments")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        RestAssured.given()
                .when().get("/api/v1/recruitments")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("창이 92일을 넘거나 from 이 to 보다 늦으면 400 이고, 92일 창은 허용한다")
    void windowOverLimitOrReversedIsRejected() {
        LocalDate from = firstMonth.atDay(1);

        RestAssured.given()
                .queryParam("from", from.toString())
                .queryParam("to", from.plusDays(93).toString())
                .when().get("/api/v1/recruitments")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false));

        RestAssured.given()
                .queryParam("from", from.plusDays(1).toString())
                .queryParam("to", from.toString())
                .when().get("/api/v1/recruitments")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        RestAssured.given()
                .queryParam("from", from.toString())
                .queryParam("to", from.plusDays(92).toString())
                .when().get("/api/v1/recruitments")
                .then().statusCode(HttpStatus.OK.value());
    }

    private Club saveActiveClub(String name) throws Exception {
        Club created = Club.create(name + "-" + sequence.getAndIncrement(), ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
