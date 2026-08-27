package com.duing.domain.facilitybooking.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
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
 * 어드민 크롤 예약 현황 인수 테스트(설계 §3.6, 수정 1~4) — 권한, 동아리별 그룹핑(미매칭 주체 포함),
 * 그룹 단위 페이징(주체 페이지 간 비분리), 시설별·시설+날짜별 모드, 당월·익월 밖 400.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFacilityCrawlAcceptanceTest extends IntegrationTestBase {

    private static final String PATH = "/api/v1/admin/facility-crawl/reservations";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = userRepository.save(UserFixture.admin());
        User student = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("익명·일반 사용자 요청은 각각 401·403 이다")
    void anonymousIs401AndStudentIs403() {
        RestAssured.given()
                .when().get(PATH)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("동아리별 보기는 매칭 동아리를 앞에, 미매칭 주체(기관·행사)를 별도 그룹으로 뒤에 배치하며 분류·매칭 정보를 담는다")
    void clubGroupingIncludesUnmatchedSubjects() {
        Facility facility = saveFacility("크롤현황연습실");
        Club securedClub = clubRepository.save(Club.create("고정관념", ClubCategory.OTHER, "분과", "설명", null));
        securedClub.changeFacilitySecuredTimeTarget(true);
        clubRepository.save(securedClub);
        clubRepository.save(Club.create("ABC동아리", ClubCategory.OTHER, "분과", "설명", null)); // 플래그 OFF
        YearMonth currentMonth = YearMonth.now(clock);
        LocalDate firstDate = currentMonth.atDay(10);
        LocalDate secondDate = currentMonth.atDay(11);
        // 고정관념 연속 2일(같은 시간) + 미매칭 기관 + 플래그 OFF 등록 동아리
        saveReservation(facility, firstDate, 10, 17, "고정관념");
        saveReservation(facility, secondDate, 10, 17, "고정관념");
        saveReservation(facility, firstDate, 13, 15, "학생생활상담센터");
        saveReservation(facility, firstDate, 17, 19, "ABC동아리");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + currentMonth + "&facilityId=" + facility.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(3))
                // 매칭 동아리(이름순: ABC동아리 → 고정관념)가 앞, 미매칭 주체가 뒤
                .body("data.content[0].groupType", equalTo("CLUB"))
                .body("data.content[0].title", equalTo("ABC동아리"))
                .body("data.content[0].facilitySecuredTimeTarget", equalTo(false))
                .body("data.content[0].reservations[0].classification", equalTo("CRAWLED_RESERVATION"))
                .body("data.content[1].groupType", equalTo("CLUB"))
                .body("data.content[1].title", equalTo("고정관념"))
                .body("data.content[1].facilitySecuredTimeTarget", equalTo(true))
                .body("data.content[1].reservations.size()", equalTo(2)) // 연속 2일이 한 그룹에 함께
                .body("data.content[1].reservations[0].classification", equalTo("BASIC_SECURED_TIME"))
                .body("data.content[1].reservations[0].startTime", equalTo("10:00"))
                .body("data.content[1].reservations[0].endTime", equalTo("17:00"))
                .body("data.content[1].reservations[0].matchedClubName", equalTo("고정관념"))
                .body("data.content[2].groupType", equalTo("EXTERNAL"))
                .body("data.content[2].title", equalTo("학생생활상담센터"))
                .body("data.content[2].reservations[0].classification", equalTo("CRAWLED_RESERVATION"))
                .body("data.content[2].reservations[0].facilityName", equalTo(facility.getRoomName()));
    }

    @Test
    @DisplayName("페이징 단위는 그룹이다 — 같은 주체의 예약이 페이지 사이에서 갈라지지 않는다")
    void paginationDoesNotSplitSubjectGroups() {
        Facility facility = saveFacility("그룹페이징연습실");
        YearMonth currentMonth = YearMonth.now(clock);
        // 그룹 정렬은 표기 이름순 — "가나다단체" 가 "하하단체" 보다 앞 페이지에 온다.
        saveReservation(facility, currentMonth.atDay(10), 10, 12, "가나다단체");
        saveReservation(facility, currentMonth.atDay(11), 10, 12, "가나다단체");
        saveReservation(facility, currentMonth.atDay(12), 13, 15, "하하단체");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + currentMonth + "&facilityId=" + facility.getId()
                        + "&page=0&size=1")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1))
                .body("data.content[0].title", equalTo("가나다단체"))
                .body("data.content[0].reservations.size()", equalTo(2)) // 같은 주체 2건이 한 페이지에 온전히
                .body("data.totalElements", equalTo(2)); // 전체 그룹 수 기준

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + currentMonth + "&facilityId=" + facility.getId()
                        + "&page=1&size=1")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].title", equalTo("하하단체"));
    }

    @Test
    @DisplayName("시설별·시설+날짜별 정리 기준도 제공된다 — 기존 평면 열람 방식은 시설+날짜 그룹 헤더로 유지된다")
    void facilityAndFacilityDateGroupings() {
        Facility facility = saveFacility("모드전환연습실");
        YearMonth currentMonth = YearMonth.now(clock);
        saveReservation(facility, currentMonth.atDay(10), 10, 12, "단체A");
        saveReservation(facility, currentMonth.atDay(11), 13, 15, "단체B");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + currentMonth + "&facilityId=" + facility.getId()
                        + "&groupBy=FACILITY")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1))
                .body("data.content[0].groupType", equalTo("FACILITY"))
                .body("data.content[0].title", equalTo(facility.getRoomName()))
                .body("data.content[0].reservations.size()", equalTo(2));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + currentMonth + "&facilityId=" + facility.getId()
                        + "&groupBy=FACILITY_DATE")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(2))
                .body("data.content[0].groupType", equalTo("FACILITY_DATE"))
                .body("data.content[0].reservationDate", equalTo(currentMonth.atDay(10).toString()))
                .body("data.content[1].reservationDate", equalTo(currentMonth.atDay(11).toString()));
    }

    @Test
    @DisplayName("시설 필터 없이 조회하면 전 시설의 행이 시설 정렬 순서(sortOrder)로 병합 조회된다")
    void unfilteredQueryMergesAllFacilitiesInSortOrder() {
        Facility laterFacility = facilityRepository.save(
                Facility.create((int) (sequence.getAndIncrement() % 1_000_000), "정렬뒤연습실", null, 5));
        Facility earlierFacility = facilityRepository.save(
                Facility.create((int) (sequence.getAndIncrement() % 1_000_000), "정렬앞연습실", null, 1));
        YearMonth currentMonth = YearMonth.now(clock);
        saveReservation(laterFacility, currentMonth.atDay(10), 10, 12, "뒤시설단체");
        saveReservation(earlierFacility, currentMonth.atDay(10), 13, 15, "앞시설단체");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + currentMonth + "&groupBy=FACILITY")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(2))
                .body("data.content[0].title", equalTo("정렬앞연습실"))
                .body("data.content[1].title", equalTo("정렬뒤연습실"));
    }

    @Test
    @DisplayName("크롤 창(당월·익월) 밖 월 조회는 400 이다")
    void monthOutOfCrawlWindowIs400() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + YearMonth.now(clock).plusMonths(2))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    private Facility saveFacility(String name) {
        return facilityRepository.save(
                Facility.create((int) (sequence.getAndIncrement() % 1_000_000), name, null, 0));
    }

    private void saveReservation(Facility facility, LocalDate date, int startHour, int endHour, String organization) {
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(), sequence.getAndIncrement(),
                YearMonth.from(date), date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0),
                organization, LocalDateTime.now(clock)));
    }
}
