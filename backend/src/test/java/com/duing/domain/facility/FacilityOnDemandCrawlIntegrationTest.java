package com.duing.domain.facility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.restassured.RestAssured;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 온디맨드 크롤 영속 회귀 테스트. 조회 서비스에 클래스 레벨 read-only 트랜잭션이 있으면
 * ensureFresh 의 delete+insert 가 그 트랜잭션에 편승해 PostgreSQL 이 25006
 * (read-only 트랜잭션 내 DELETE 금지)으로 거부 → 트랜잭션 abort → 공개 GET 500 이 났다.
 * 미신선 과거월 공개 GET 이 200 + LIVE_FETCH 를 반환하고 예약·월 메타가 실제
 * PostgreSQL 에 영속되는 것까지 검증한다(학교 HTTP 만 stub).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FacilityOnDemandCrawlIntegrationTest extends IntegrationTestBase {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @LocalServerPort int port;

    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository reservationRepository;
    @Autowired FacilityMonthSnapshotRepository snapshotRepository;
    @MockitoBean SchoolFacilityClient schoolFacilityClient;

    @Test
    @DisplayName("미캐시 과거월 공개 GET 은 온디맨드 크롤로 200 LIVE_FETCH 를 반환하고 예약과 월 메타를 실제로 영속한다")
    void onDemandCrawlPersistsReservationsAndMeta() throws Exception {
        RestAssured.port = port;
        // 과거월: 스케줄러(현재·다음월) 대상이 아니라 온디맨드 크롤로만 채워지며, ±12개월 창 안이라 400 이 아니다.
        YearMonth pastMonth = YearMonth.now(KST).minusMonths(1);
        Facility savedFacility = facilityRepository.save(Facility.create(4, "공동연습실(1)", "2105", 0));

        ObjectMapper objectMapper = new ObjectMapper();
        // 공개 GET → ensureFresh 는 온디맨드 예산 메서드로 fetch 한다.
        when(schoolFacilityClient.fetchReservationsOnDemand(anyInt(), any())).thenReturn(objectMapper.readTree(
                """
                [{"schedule_seq":"18134","schedule_dept":"고정관념(9:00~20:00)",
                  "schedule_date":"01","schedule_time":"19:00~20:00"}]
                """));

        RestAssured.given()
                .when().get("/api/v1/facilities/usage?yearMonth=" + pastMonth)
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.source", equalTo("LIVE_FETCH"));

        List<FacilityReservation> persistedReservations =
                reservationRepository.findByFacilityIdAndYearMonth(savedFacility.getId(), pastMonth);
        assertThat(persistedReservations).hasSize(1);
        assertThat(persistedReservations.get(0).getScheduleSeq()).isEqualTo(18134L);
        assertThat(persistedReservations.get(0).getOrganizationName()).isEqualTo("고정관념");
        // 물결 꼬리 (9:00~20:00) 도 시간 범위는 마커 슬롯(19~20) 대신 전 구간으로 확장 저장된다(V116 유지) —
        // 확보 표기 여부는 securedTail 플래그로만 갈린다(V118 행 단위 분류).
        assertThat(persistedReservations.get(0).getStartTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(persistedReservations.get(0).getEndTime()).isEqualTo(LocalTime.of(20, 0));

        FacilityMonthSnapshot monthMeta = snapshotRepository.findByYearMonth(pastMonth).orElseThrow();
        assertThat(monthMeta.getFetchStatus()).isEqualTo(FetchStatus.SUCCESS);
    }
}
