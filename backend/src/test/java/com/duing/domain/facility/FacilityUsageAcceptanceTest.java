package com.duing.domain.facility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilitySnapshotWriter;
import io.restassured.RestAssured;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
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
class FacilityUsageAcceptanceTest extends IntegrationTestBase {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @LocalServerPort int port;

    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository reservationRepository;
    @Autowired FacilityMonthSnapshotRepository snapshotRepository;
    @Autowired FacilitySnapshotWriter snapshotWriter;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        YearMonth current = YearMonth.now(KST);
        LocalDate today = LocalDate.now(KST);
        LocalDateTime now = LocalDateTime.now(KST);

        Facility facility = facilityRepository.save(Facility.create(4, "공동연습실(1)", "2105", 0));
        // 현재월 신선 스냅샷 → ensureFresh 가 CACHE 로 판정해 외부(학교) 호출 없음.
        snapshotRepository.save(FacilityMonthSnapshot.create(
                current, now, CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null));
        reservationRepository.save(FacilityReservation.create(
                facility.getId(), 90001L, current, today, LocalTime.of(9, 0), LocalTime.of(10, 0), "댄스동아리", now));
    }

    @Test
    @DisplayName("비로그인 GET /api/v1/facilities 는 200 이고 id/roomName/location 만 담고 room_seq 는 없다")
    void listFacilitiesPublicNoRoomSeq() {
        String body = RestAssured.given()
                .when().get("/api/v1/facilities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .header("Cache-Control", org.hamcrest.Matchers.containsString("max-age=60"))
                .body("data[0].roomName", equalTo("공동연습실(1)"))
                .body("data[0].location", equalTo("2105"))
                .extract().asString();
        assertThat(body).doesNotContain("roomSeq").doesNotContain("room_seq");
    }

    @Test
    @DisplayName("비로그인 GET /api/v1/facilities/usage 는 200 이고 source/stale/lastUpdatedAt 을 포함하며 room_seq 를 노출하지 않는다")
    void usagePublicContainsMetaFieldsAndHidesRoomSeq() {
        String body = RestAssured.given()
                .when().get("/api/v1/facilities/usage")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.source", equalTo("CACHE"))
                .body("data.stale", equalTo(false))
                // lastUpdatedAt 은 KST(+09:00) ISO 오프셋 형식
                .body("data.lastUpdatedAt", matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?\\+09:00"))
                .body("data.facilities[0].roomName", equalTo("공동연습실(1)"))
                .body("data.facilities[0].reservations[0].start", equalTo("09:00"))
                .body("data.facilities[0].reservations[0].organization", equalTo("댄스동아리"))
                .body("data.facilities[0].id", notNullValue())
                .extract().asString();
        assertThat(body).doesNotContain("roomSeq").doesNotContain("room_seq");
    }

    @Test
    @DisplayName("FacilitySnapshotWriter 가 기존 예약을 원자적으로 삭제·교체하고, 빈 목록 교체 시 예약이 모두 사라진다")
    void snapshotWriterReplacesReservationsAtomicallyAndSupportsEmptyReplace() {
        YearMonth currentMonth = YearMonth.now(KST);
        LocalDate today = LocalDate.now(KST);
        LocalDateTime now = LocalDateTime.now(KST);

        Facility facility = facilityRepository.save(Facility.create(5, "테스트연습실", "테스트동", 1));
        reservationRepository.save(FacilityReservation.create(
                facility.getId(), 90101L, currentMonth, today, LocalTime.of(11, 0), LocalTime.of(12, 0), "기존단체1", now));
        reservationRepository.save(FacilityReservation.create(
                facility.getId(), 90102L, currentMonth, today, LocalTime.of(13, 0), LocalTime.of(14, 0), "기존단체2", now));

        long newSeq = 90201L;
        snapshotWriter.replaceReservations(
                facility.getId(),
                List.of(currentMonth),
                Map.of(currentMonth, List.of(new ParsedReservation(newSeq, today, LocalTime.of(9, 0), LocalTime.of(10, 0), "새단체"))),
                now);

        List<FacilityReservation> afterReplace =
                reservationRepository.findByFacilityIdAndYearMonth(facility.getId(), currentMonth);
        assertThat(afterReplace).hasSize(1);
        assertThat(afterReplace.get(0).getScheduleSeq()).isEqualTo(newSeq);
        assertThat(afterReplace.get(0).getOrganizationName()).isEqualTo("새단체");

        snapshotWriter.replaceReservations(
                facility.getId(), List.of(currentMonth), Map.of(currentMonth, List.of()), now);

        List<FacilityReservation> afterEmptyReplace =
                reservationRepository.findByFacilityIdAndYearMonth(facility.getId(), currentMonth);
        assertThat(afterEmptyReplace).isEmpty();
    }
}
