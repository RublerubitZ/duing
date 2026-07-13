package com.duing.domain.facilitybooking.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.controller.dto.response.BookingWindowResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.service.BookingWindow;
import com.duing.domain.facilitybooking.service.BookingWindowPolicy;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityService;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FacilityAvailabilityAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired FacilityAvailabilityService availabilityService;
    @Autowired FacilityRepository facilityRepository;
    @Autowired BookingWindowPolicy bookingWindowPolicy;

    // 서비스가 seoulClock(KST) 기준으로 당월을 계산하므로 테스트도 같은 Clock 을 써야
    // UTC CI 러너의 월 경계(매월 1일 00:00~09:00 KST)에서 결정적 실패를 피할 수 있다.
    @Autowired Clock clock;

    // 온디맨드 크롤 차단 — 실제 학교 서버 HTTP 시도를 막는다. 스냅샷이 없으므로 stale=true 로 내려간다.
    @MockitoBean FacilityCrawlService facilityCrawlService;

    @BeforeEach
    void stubCrawl() {
        RestAssured.port = port;
        given(facilityCrawlService.ensureFresh(any())).willReturn(DataSource.STALE_CACHE);
    }

    @Test
    @DisplayName("크롤 데이터가 없는 시설은 예약 오픈 창의 첫 날짜가 종일 AVAILABLE 이다")
    void availabilityForEmptyMonth() {
        Facility facility = facilityRepository.save(Facility.create(90001, "커뮤니티룸(T)", null, 0));

        FacilityAvailabilityResponse response =
                availabilityService.getAvailability(facility.getId(), YearMonth.now(clock));

        // bookableFrom·bookableUntil 은 반월 오픈 정책이 계산한 현재 창과 정확히 일치해야 한다(익월말 고정 아님).
        BookingWindow window = bookingWindowPolicy.windowFor(LocalDate.now(clock));
        assertThat(response.days()).hasSize(YearMonth.now(clock).lengthOfMonth());
        assertThat(response.bookableFrom()).isEqualTo(window.from());
        assertThat(response.bookableUntil()).isEqualTo(window.until());
        assertThat(response.stale()).isTrue();
        assertThat(response.days().get(response.days().size() - 1).slots()).hasSize(13);

        // 창(예약 오픈 구간) 내 날짜는 미래이고 크롤·예약이 없으므로 그날 슬롯 13칸이 전부 AVAILABLE 이다.
        FacilityAvailabilityResponse windowMonth =
                availabilityService.getAvailability(facility.getId(), YearMonth.from(window.from()));
        FacilityAvailabilityResponse.DayAvailability firstBookableDay = windowMonth.days().stream()
                .filter(dayAvailability -> dayAvailability.date().equals(window.from()))
                .findFirst()
                .orElseThrow();
        assertThat(firstBookableDay.availableSlotCount()).isEqualTo(13);
        assertThat(firstBookableDay.slots()).allSatisfy(slot ->
                assertThat(slot.status()).isEqualTo(FacilityAvailabilityResponse.SlotStatus.AVAILABLE));
    }

    @Test
    @DisplayName("당월·익월 밖의 월 조회는 400 도메인 예외다")
    void rejectsMonthOutOfBookingRange() {
        Facility facility = facilityRepository.save(Facility.create(90002, "커뮤니티룸(T2)", null, 0));

        assertThatThrownBy(() -> availabilityService.getAvailability(facility.getId(), YearMonth.now(clock).plusMonths(2)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
        assertThatThrownBy(() -> availabilityService.getAvailability(facility.getId(), YearMonth.now(clock).minusMonths(1)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
    }

    @Test
    @DisplayName("예약 오픈 구간 API 는 비로그인으로 현재 구간을 반환하고 가용성 응답의 창과 일치한다")
    void bookingWindowMatchesAvailabilityWindow() {
        BookingWindow expected = bookingWindowPolicy.windowFor(LocalDate.now(clock));

        BookingWindowResponse response = RestAssured.given()
                .when().get("/api/v1/facilities/booking-window")
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getObject("data", BookingWindowResponse.class);

        assertThat(response.bookableFrom()).isEqualTo(expected.from());
        assertThat(response.bookableUntil()).isEqualTo(expected.until());
    }

    @Test
    @DisplayName("가용성 GET 은 비로그인 200 + Cache-Control no-store, Preset GET 은 시드 9종을 반환한다")
    void publicEndpointsAreAccessible() {
        Facility facility = facilityRepository.save(Facility.create(90003, "커뮤니티룸(T3)", null, 0));

        // 비로그인(인증 헤더 없음) 가용성 GET → 200 + Cache-Control: no-store
        RestAssured.given()
                .when().get("/api/v1/facilities/" + facility.getId() + "/availability")
                .then()
                .statusCode(HttpStatus.OK.value())
                .header("Cache-Control", "no-store");

        // 비로그인 Preset GET → 200 + 시드 9종, 첫 라벨 "동아리 정기 모임"
        RestAssured.given()
                .when().get("/api/v1/facilities/booking-purpose-presets")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.size()", equalTo(9))
                .body("data[0].label", equalTo("동아리 정기 모임"));
    }
}
