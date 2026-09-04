package com.duing.domain.facility.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
 * 총동연 예약 오픈일 관리 API 인수 테스트(플랜 §5 T8) — 권한 3층(익명 401·일반 403·ADMIN 200),
 * 시설별 PATCH 의 설정·닫기·검증·404·no-op, 전체 PATCH 의 활성 시설 한정 적용과 실패 시 전량 롤백.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFacilityAcceptanceTest extends IntegrationTestBase {

    private static final String LIST_PATH = "/api/v1/admin/facilities";
    private static final String ALL_PATCH_PATH = "/api/v1/admin/facilities/booking-open-date";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired FacilityRepository facilityRepository;
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
    @DisplayName("ADMIN 목록 조회는 활성 시설을 sort_order 순으로 내리고 오픈일 미설정 시설은 null 로, 캐시는 no-store 다")
    void listReturnsActiveFacilitiesWithOpenDateAndNoStore() {
        LocalDate openDate = LocalDate.now(clock).plusDays(5);
        Facility openedFacility = saveFacility("정렬앞연습실", 1);
        openedFacility.changeBookingOpenDate(openDate);
        facilityRepository.save(openedFacility);
        saveFacility("정렬뒤연습실", 2);
        facilityRepository.save(archived(saveFacility("아카이브연습실", 0)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(LIST_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .header(HttpHeaders.CACHE_CONTROL, containsString("no-store"))
                .body("data.size()", equalTo(2))
                .body("data[0].roomName", equalTo("정렬앞연습실"))
                .body("data[0].location", equalTo("2105"))
                .body("data[0].bookingOpenDate", equalTo(openDate.toString()))
                .body("data[1].roomName", equalTo("정렬뒤연습실"))
                .body("data[1].bookingOpenDate", nullValue());
    }

    @Test
    @DisplayName("익명·일반 사용자 요청은 각각 401·403 이다")
    void anonymousIs401AndStudentIs403() {
        RestAssured.given()
                .when().get(LIST_PATH)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(LIST_PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON).body(bodyOf(LocalDate.now(clock).toString()))
                .when().patch(ALL_PATCH_PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("시설 오픈일을 설정하면 204 이고 목록 조회에 그대로 반영된다")
    void patchSetsOpenDateAndListReflectsIt() {
        Facility facility = saveFacility("설정연습실", 0);
        LocalDate openDate = LocalDate.now(clock).plusDays(5);

        patchFacility(facility.getId(), bodyOf(openDate.toString()))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(LIST_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data[0].bookingOpenDate", equalTo(openDate.toString()));
    }

    @Test
    @DisplayName("오픈일에 null 을 보내면 204 로 닫히고, 같은 값 재요청도 204 다(no-op)")
    void patchNullClosesFacilityAndSameValueIsNoOp() {
        Facility facility = saveFacility("닫기연습실", 0);
        LocalDate openDate = LocalDate.now(clock).plusDays(3);
        patchFacility(facility.getId(), bodyOf(openDate.toString()))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 같은 값 재요청 — 변경이 없어도 204 로 멱등하게 끝난다.
        patchFacility(facility.getId(), bodyOf(openDate.toString()))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        assertThat(reload(facility).getBookingOpenDate()).isEqualTo(openDate);

        patchFacility(facility.getId(), bodyOf(null))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        assertThat(reload(facility).getBookingOpenDate()).isNull();
    }

    @Test
    @DisplayName("형식이 아닌 날짜와 오늘+1년 초과는 400 이고, 과거 날짜는 204 로 허용된다")
    void invalidFormatAndBeyondHorizonAre400WhilePastIsAllowed() {
        Facility facility = saveFacility("검증연습실", 0);

        patchFacility(facility.getId(), bodyOf("2026-13-01"))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        patchFacility(facility.getId(), bodyOf(LocalDate.now(clock).plusYears(1).plusDays(1).toString()))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        assertThat(reload(facility).getBookingOpenDate()).as("400 이면 아무것도 저장되지 않는다").isNull();

        LocalDate pastOpenDate = LocalDate.now(clock).minusMonths(2);
        patchFacility(facility.getId(), bodyOf(pastOpenDate.toString()))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        assertThat(reload(facility).getBookingOpenDate()).isEqualTo(pastOpenDate);
    }

    @Test
    @DisplayName("존재하지 않는 시설의 오픈일 변경은 404 다")
    void unknownFacilityIs404() {
        patchFacility(999_999L, bodyOf(LocalDate.now(clock).toString()))
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("전체 적용은 활성 시설만 한 번에 바꾸고 아카이브 시설의 오픈일은 건드리지 않는다")
    void updateAllAppliesToActiveFacilitiesOnly() {
        Facility firstFacility = saveFacility("전체연습실1", 1);
        Facility secondFacility = saveFacility("전체연습실2", 2);
        Facility thirdFacility = saveFacility("전체연습실3", 3);
        Facility archivedFacility = facilityRepository.save(archived(saveFacility("전체아카이브연습실", 4)));
        LocalDate openDate = LocalDate.now(clock).plusDays(7);

        patchAll(bodyOf(openDate.toString()))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(reload(firstFacility).getBookingOpenDate()).isEqualTo(openDate);
        assertThat(reload(secondFacility).getBookingOpenDate()).isEqualTo(openDate);
        assertThat(reload(thirdFacility).getBookingOpenDate()).isEqualTo(openDate);
        assertThat(reload(archivedFacility).getBookingOpenDate())
                .as("아카이브 시설은 전체 적용 대상이 아니다").isNull();

        patchAll(bodyOf(null))
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        assertThat(reload(firstFacility).getBookingOpenDate()).isNull();
        assertThat(reload(thirdFacility).getBookingOpenDate()).isNull();
    }

    @Test
    @DisplayName("전체 적용이 1년 초과로 400 이면 어떤 시설의 오픈일도 바뀌지 않는다(부분 적용 없음)")
    void updateAllRollsBackEveryRowWhenBeyondHorizon() {
        Facility firstFacility = saveFacility("롤백연습실1", 1);
        Facility secondFacility = saveFacility("롤백연습실2", 2);
        LocalDate seededOpenDate = LocalDate.now(clock).plusDays(2);
        patchAll(bodyOf(seededOpenDate.toString()))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        patchAll(bodyOf(LocalDate.now(clock).plusYears(1).plusDays(1).toString()))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(reload(firstFacility).getBookingOpenDate()).isEqualTo(seededOpenDate);
        assertThat(reload(secondFacility).getBookingOpenDate()).isEqualTo(seededOpenDate);
    }

    private Response patchFacility(Long facilityId, String body) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().patch(LIST_PATH + "/" + facilityId + "/booking-open-date");
    }

    private Response patchAll(String body) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON).body(body)
                .when().patch(ALL_PATCH_PATH);
    }

    private String bodyOf(String isoDate) {
        return isoDate == null
                ? "{\"bookingOpenDate\": null}"
                : "{\"bookingOpenDate\": \"" + isoDate + "\"}";
    }

    private Facility reload(Facility facility) {
        return facilityRepository.findById(facility.getId()).orElseThrow();
    }

    private Facility saveFacility(String roomName, int sortOrder) {
        return facilityRepository.save(
                Facility.create((int) (sequence.getAndIncrement() % 1_000_000), roomName, "2105", sortOrder));
    }

    private Facility archived(Facility facility) {
        facility.archive(LocalDateTime.now(clock));
        return facility;
    }
}
