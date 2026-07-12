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
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityService;
import io.restassured.RestAssured;
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

    // 온디맨드 크롤 차단 — 실제 학교 서버 HTTP 시도를 막는다. 스냅샷이 없으므로 stale=true 로 내려간다.
    @MockitoBean FacilityCrawlService facilityCrawlService;

    @BeforeEach
    void stubCrawl() {
        RestAssured.port = port;
        given(facilityCrawlService.ensureFresh(any())).willReturn(DataSource.STALE_CACHE);
    }

    @Test
    @DisplayName("크롤 데이터가 없는 시설의 당월 가용성은 미래 날짜가 종일 AVAILABLE 이다")
    void availabilityForEmptyMonth() {
        Facility facility = facilityRepository.save(Facility.create(90001, "커뮤니티룸(T)", null, 0));

        FacilityAvailabilityResponse response =
                availabilityService.getAvailability(facility.getId(), YearMonth.now());

        assertThat(response.days()).hasSize(YearMonth.now().lengthOfMonth());
        assertThat(response.bookableUntil()).isEqualTo(YearMonth.now().plusMonths(1).atEndOfMonth());
        assertThat(response.stale()).isTrue();
        assertThat(response.days().get(response.days().size() - 1).slots()).hasSize(13);
    }

    @Test
    @DisplayName("당월·익월 밖의 월 조회는 400 도메인 예외다")
    void rejectsMonthOutOfBookingRange() {
        Facility facility = facilityRepository.save(Facility.create(90002, "커뮤니티룸(T2)", null, 0));

        assertThatThrownBy(() -> availabilityService.getAvailability(facility.getId(), YearMonth.now().plusMonths(2)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
        assertThatThrownBy(() -> availabilityService.getAvailability(facility.getId(), YearMonth.now().minusMonths(1)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
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
