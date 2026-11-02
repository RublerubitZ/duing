package com.duing.domain.adminconsole.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.adminconsole.service.AdminPendingSnapshotRecorder;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
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
class AdminWeeklyBriefingControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired AdminPendingSnapshotRecorder adminPendingSnapshotRecorder;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired Clock clock;

    private String adminToken;
    private String studentToken;
    private LocalDate currentMonday;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
        currentMonday = LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    @Test
    @DisplayName("가장 최근에 끝난 주는 다섯 업무·첫 답변·활동 칸을 모두 담아 주고, 일요일 기록이 없으면 endPending 키를 null 로 남긴다")
    void returnsEveryFieldWithNullEndPending() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("weekStart", currentMonday.minusWeeks(1).toString())
                .when()
                    .get("/api/v1/admin/weekly-briefing")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.flow.report.receivedCount", equalTo(0))
                    .body("data.flow.inquiry.handledCount", equalTo(0))
                    .body("data.flow.facilityBooking.receivedCount", equalTo(0))
                    .body("data.flow.promotionRequest.handledCount", equalTo(0))
                    .body("data.flow.leaderSuccession.receivedCount", equalTo(0))
                    .body("data", hasKey("endPending"))
                    .body("data.endPending", nullValue())
                    .body("data", hasKey("pendingRecordStartedOn"))
                    .body("data.pendingRecordStartedOn", nullValue())
                    .body("data.inquiryFirstAnswer.answerCount", equalTo(0))
                    .body("data.inquiryFirstAnswer", hasKey("averageMinutes"))
                    .body("data.inquiryFirstAnswer.averageMinutes", nullValue())
                    .body("data.federationNoticeCount", equalTo(0))
                    .body("data.recruitment.createdCount", equalTo(0))
                    .body("data.recruitment.endedCount", equalTo(0))
                    .body("data.recruitment.applicationCount", equalTo(0))
                    .body("data.fee.billCount", equalTo(0))
                    .body("data.fee.billedClubCount", equalTo(0))
                    .body("data.fee.paymentCount", equalTo(0))
                    .body("data.fee.voidedPaymentCount", equalTo(0))
                    .body("data.fee.accountChangedClubCount", equalTo(0))
                    .body("data.profileCheckConfirmedCount", equalTo(0));
    }

    @Test
    @DisplayName("일요일 기록이 있으면 8칸과 합계를 그 기록 그대로 주고 첫 기록 날짜를 KST 날짜로 준다")
    void returnsSundaySnapshot() {
        LocalDate sunday = currentMonday.minusDays(1);
        adminPendingSnapshotRecorder.record(sunday, AdminPendingCountsQuery.of(1, 2, 3, 4, 5, 6, 7, 8));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("weekStart", currentMonday.minusWeeks(1).toString())
                .when()
                    .get("/api/v1/admin/weekly-briefing")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.endPending.clubApproval", equalTo(1))
                    .body("data.endPending.facilityBooking", equalTo(2))
                    .body("data.endPending.inquiryUnanswered", equalTo(3))
                    .body("data.endPending.promotionRequest", equalTo(4))
                    .body("data.endPending.reportUnresolved", equalTo(5))
                    .body("data.endPending.leaderSuccession", equalTo(6))
                    .body("data.endPending.stalePendingRecruitment", equalTo(7))
                    .body("data.endPending.inactiveClubPending", equalTo(8))
                    .body("data.endPending.totalPendingCount", equalTo(36))
                    .body("data.pendingRecordStartedOn", equalTo(sunday.toString()));
    }

    @Test
    @DisplayName("월요일이 아닌 날·진행 중인 주·아직 오지 않은 주·53주 전은 각자의 code 와 한국어 메시지로 400 을 준다")
    void rejectsOutOfRangeWeeksWithCodes() {
        assertBadRequest(currentMonday.minusDays(6), "WEEK_NOT_MONDAY");
        assertBadRequest(currentMonday, "WEEK_NOT_ENDED");
        assertBadRequest(currentMonday.plusWeeks(1), "WEEK_IN_FUTURE");
        assertBadRequest(currentMonday.minusWeeks(53), "WEEK_TOO_OLD");
    }

    @Test
    @DisplayName("weekStart 가 없거나 날짜로 읽히지 않으면 400 이다")
    void rejectsMissingOrMalformedWeekStart() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/weekly-briefing")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken).queryParam("weekStart", "2026-13-01")
                .when().get("/api/v1/admin/weekly-briefing")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("ADMIN 이 아닌 사용자는 주간 브리핑을 조회할 수 없다")
    void rejectsNonAdminUser() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .queryParam("weekStart", currentMonday.minusWeeks(1).toString())
                .when().get("/api/v1/admin/weekly-briefing")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("로그인하지 않으면 401 이다")
    void rejectsAnonymous() {
        RestAssured.given().queryParam("weekStart", currentMonday.minusWeeks(1).toString())
                .when().get("/api/v1/admin/weekly-briefing")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private void assertBadRequest(LocalDate weekStart, String expectedCode) {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("weekStart", weekStart.toString())
                .when()
                    .get("/api/v1/admin/weekly-briefing")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("ok", equalTo(false))
                    .body("code", equalTo(expectedCode))
                    .body("message", notNullValue());
    }
}
