package com.duing.domain.adminconsole.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityService;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminWeeklyFacilityHeatmapAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired FacilityAvailabilityService availabilityService;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    @Autowired FacilityBookingRepository facilityBookingRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired Clock clock;

    // 온디맨드 크롤 차단 — 캘린더 대조가 학교 서버에 붙지 않게 한다(FacilityAvailabilityAcceptanceTest 와 같은 설정).
    @MockitoBean FacilityCrawlService facilityCrawlService;

    private final AtomicLong sequence = new AtomicLong(91_000);
    private String adminToken;
    private String studentToken;
    private Long adminUserId;
    private Long clubId;
    private LocalDate currentMonday;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        given(facilityCrawlService.ensureFresh(any())).willReturn(DataSource.STALE_CACHE);
        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        adminUserId = adminUser.getId();
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
        clubId = clubRepository.save(ClubFixture.academic("히트맵동아리")).getId();
        currentMonday = LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    @Test
    @DisplayName("이번 주 히트맵의 칸 수는 같은 날 예약 캘린더(GET /facilities/{id}/availability)의 차단 칸 수와 같다")
    void heatmapMatchesBookingCalendarBlockedSlots() {
        Facility hall = facilityRepository.save(Facility.create((int) sequence.incrementAndGet(), "강당(T)", null, 0));
        approve(hall, currentMonday, LocalTime.of(10, 0), LocalTime.of(12, 0), false);
        approve(hall, currentMonday.plusDays(2), LocalTime.of(13, 30), LocalTime.of(15, 0), true);
        facilityBookingRepository.save(FacilityBooking.request(hall.getId(), clubId, adminUserId, currentMonday.plusDays(3),
                LocalTime.of(16, 0), LocalTime.of(17, 0), "검토 중", 10, "010-1234-5678"));
        crawl(hall, currentMonday, LocalTime.of(11, 0), LocalTime.of(13, 0), "학교 행사", false);
        crawl(hall, currentMonday.plusDays(4), LocalTime.of(9, 0), LocalTime.of(10, 0), "학교 행사", false);
        Club securedClub = ClubFixture.academic("확보동아리");
        securedClub.changeFacilitySecuredTimeTarget(true);
        clubRepository.save(securedClub);
        crawl(hall, currentMonday.plusDays(4), LocalTime.of(18, 0), LocalTime.of(19, 0), "확보동아리", true);

        List<Integer> heatmap = RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("weekStart", currentMonday.toString())
                .when()
                    .get("/api/v1/admin/weekly-briefing/facility-heatmap")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.facilities[0].roomName", equalTo("강당(T)"))
                    .extract().jsonPath().getList("data.facilities[0].occupiedSlotCounts", Integer.class);
        // 히트맵은 학교 사이트에 붙지 않는다 — 캘린더(아래)는 온디맨드 크롤을 부르므로 그 전에 단정한다.
        then(facilityCrawlService).shouldHaveNoInteractions();

        List<Integer> calendar = currentMonday.datesUntil(currentMonday.plusDays(7))
                .map(date -> (int) availabilityService.getAvailability(hall.getId(), YearMonth.from(date)).days().stream()
                        .filter(day -> day.date().equals(date))
                        .findFirst().orElseThrow()
                        .slots().stream().filter(slot -> slot.status() == SlotStatus.BLOCKED).count())
                .toList();
        assertThat(heatmap).isEqualTo(calendar);
        // 둘 다 0 으로 같아지는 헛통과를 막는다 — 월 {10,11}∪{11,12}=3, 수 {13,14}=2, 금 {9}=1(확보 행 제외)
        assertThat(heatmap).containsExactly(3, 0, 2, 0, 1, 0, 0);
    }

    @Test
    @DisplayName("진행 중인 이번 주는 200 이고 수집 기록이 없으면 currentMonthCrawledAt 키를 null 로 남긴다")
    void acceptsCurrentWeek() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("weekStart", currentMonday.toString())
                .when().get("/api/v1/admin/weekly-briefing/facility-heatmap")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasKey("currentMonthCrawledAt"))
                .body("data.currentMonthCrawledAt", nullValue());
    }

    @Test
    @DisplayName("이번 달 수집 기록이 있으면 currentMonthCrawledAt 은 그 KST 벽시계 시각의 절대시각(…Z)이다")
    void returnsCurrentMonthCrawledAtAsInstant() {
        LocalDateTime crawledAt = LocalDateTime.of(currentMonday, LocalTime.of(9, 0));
        facilityMonthSnapshotRepository.save(FacilityMonthSnapshot.create(YearMonth.now(clock), crawledAt,
                CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null));

        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("weekStart", currentMonday.toString())
                .when().get("/api/v1/admin/weekly-briefing/facility-heatmap")
                .then().statusCode(HttpStatus.OK.value())
                // KST 09:00 = 같은 날 00:00Z — 저장 존(system) 으로 읽으면 UTC JVM 에서 09:00Z 로 9시간 밀린다.
                .body("data.currentMonthCrawledAt",
                        equalTo(crawledAt.atZone(ZoneId.of("Asia/Seoul")).toInstant().toString()));
    }

    @Test
    @DisplayName("다음 주는 WEEK_IN_FUTURE, 53주 전은 WEEK_TOO_OLD, 월요일이 아니면 WEEK_NOT_MONDAY 로 400 이다")
    void rejectsOutOfRangeWeeks() {
        assertBadRequest(currentMonday.plusWeeks(1), "WEEK_IN_FUTURE");
        assertBadRequest(currentMonday.minusWeeks(53), "WEEK_TOO_OLD");
        assertBadRequest(currentMonday.plusDays(1), "WEEK_NOT_MONDAY");
    }

    @Test
    @DisplayName("weekStart 가 없거나 날짜로 읽히지 않으면 400 이다")
    void rejectsMissingOrMalformedWeekStart() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/weekly-briefing/facility-heatmap")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken).queryParam("weekStart", "2026-13-01")
                .when().get("/api/v1/admin/weekly-briefing/facility-heatmap")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("ADMIN 이 아닌 사용자는 403, 로그인하지 않으면 401 이다")
    void rejectsNonAdminAndAnonymous() {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .queryParam("weekStart", currentMonday.toString())
                .when().get("/api/v1/admin/weekly-briefing/facility-heatmap")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        RestAssured.given().queryParam("weekStart", currentMonday.toString())
                .when().get("/api/v1/admin/weekly-briefing/facility-heatmap")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private void approve(Facility facility, LocalDate date, LocalTime start, LocalTime end, boolean confirm) {
        FacilityBooking booking = facilityBookingRepository.save(FacilityBooking.request(facility.getId(), clubId,
                adminUserId, date, start, end, "정기 모임", 10, "010-1234-5678"));
        booking.approve(adminUserId, LocalDateTime.now(clock), LocalDateTime.now(clock));
        if (confirm) {
            booking.confirmManually(LocalDateTime.now(clock));
        }
        facilityBookingRepository.save(booking);
    }

    private void crawl(Facility facility, LocalDate date, LocalTime start, LocalTime end, String organization,
                       boolean securedTail) {
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(), sequence.incrementAndGet(),
                YearMonth.from(date), date, start, end, organization, securedTail, LocalDateTime.now(clock)));
    }

    private void assertBadRequest(LocalDate weekStart, String expectedCode) {
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .queryParam("weekStart", weekStart.toString())
                .when().get("/api/v1/admin/weekly-briefing/facility-heatmap")
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo(expectedCode));
    }
}
