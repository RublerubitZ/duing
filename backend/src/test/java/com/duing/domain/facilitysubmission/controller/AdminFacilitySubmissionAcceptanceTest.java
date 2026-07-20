package com.duing.domain.facilitysubmission.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.assertj.core.api.Assertions;
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
class AdminFacilitySubmissionAcceptanceTest extends IntegrationTestBase {

    private static final String SUBMISSION_PATH = "/api/v1/admin/facility-bookings/submission";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilitySubmissionAuditRepository auditRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime() % 1_000_000);

    private User admin;
    private String adminToken;
    private String studentToken;
    private User applicant;
    private Club club;
    private Facility facility;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        admin = userRepository.save(UserFixture.admin());
        User student = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        applicant = userRepository.save(UserFixture.unique());
        club = clubRepository.save(Club.create("인수동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private FacilityBooking approvedBooking(int startHour) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        return bookingRepository.save(booking);
    }

    private String candidatesPath() {
        LocalDate baseDate = LocalDate.now().plusDays(7);
        return SUBMISSION_PATH + "/candidates?facilityId=" + facility.getId()
                + "&startDate=" + baseDate.minusDays(1) + "&endDate=" + baseDate.plusDays(1);
    }

    @Test
    @DisplayName("익명·일반 사용자 요청은 각각 401·403 이다")
    void anonymousIs401AndStudentIs403() {
        RestAssured.given()
                .when().get(candidatesPath())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(candidatesPath())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("submission 경로가 예약 상세 템플릿에 삼켜지지 않고 이력 200 을 반환한다")
    void submissionPathIsNotSwallowedByBookingDetailTemplate() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", notNullValue());
    }

    @Test
    @DisplayName("candidates 경로가 batchId 템플릿에 삼켜지지 않고 summary·bookings 를 반환한다")
    void candidatesPathIsNotSwallowedByBatchIdTemplate() {
        approvedBooking(9);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(candidatesPath())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.summary.awaitingCount", equalTo(1))
                .body("data.bookings[0].selectable", is(true))
                .body("data.bookings[0].clubName", equalTo(club.getName()));
    }

    @Test
    @DisplayName("facilityId 없이 후보를 조회하면 전 시설이 시설명과 함께 반환된다")
    void candidatesWithoutFacilityReturnAllFacilities() {
        approvedBooking(9);
        LocalDate baseDate = LocalDate.now().plusDays(7);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/candidates?startDate=" + baseDate.minusDays(1)
                        + "&endDate=" + baseDate.plusDays(1))
                .then().statusCode(HttpStatus.OK.value())
                .body("data.bookings[0].facilityId", notNullValue())
                .body("data.bookings[0].facilityName", equalTo(facility.getRoomName()));
    }

    @Test
    @DisplayName("생성→CSV 다운로드→상세→취소→재취소가 전 구간 계약대로 동작한다")
    void createDownloadDetailCancelFlow() {
        FacilityBooking booking = approvedBooking(9);

        Integer batchId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("bookingIds", List.of(booking.getId()), "memo", "8월 1차"))
                .when().post(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.submissionNo", notNullValue())
                .body("data.csvFileName", notNullValue())
                .extract().path("data.batchId");

        byte[] csvBytes = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId + "/csv")
                .then().statusCode(HttpStatus.OK.value())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        org.hamcrest.Matchers.containsString("attachment; filename*=UTF-8''"))
                .extract().asByteArray();
        Assertions.assertThat(csvBytes.length).isGreaterThanOrEqualTo(3);
        Assertions.assertThat(csvBytes[0]).isEqualTo((byte) 0xEF);
        Assertions.assertThat(csvBytes[1]).isEqualTo((byte) 0xBB);
        Assertions.assertThat(csvBytes[2]).isEqualTo((byte) 0xBF);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.batch.bookingCount", equalTo(1))
                .body("data.bookings[0].bookingId", equalTo(booking.getId().intValue()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 목록 조회는 감사 대상이 아니다 — 아래 containsExactly 가 이 호출의 미기록까지 증명한다
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.OK.value());

        // 감사 4종이 순서대로만 남는다: CREATED → CSV_DOWNLOADED → VIEWED → CANCELLED (목록 조회 미기록)
        Assertions.assertThat(auditRepository.findByBatchIdOrderByIdAsc(batchId.longValue()))
                .extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.CSV_DOWNLOADED,
                        SubmissionAuditAction.VIEWED, SubmissionAuditAction.CANCELLED);
        Assertions.assertThat(auditRepository.findByBatchIdOrderByIdAsc(batchId.longValue()).get(0).getIpAddress())
                .isNotBlank();
    }

    @Test
    @DisplayName("빈 bookingIds 로 생성하면 400 검증 오류가 발생한다")
    void emptyBookingIdsReturns400() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("bookingIds", List.of()))
                .when().post(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 Batch 상세·CSV·취소는 404 를 반환한다")
    void unknownBatchReturns404() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/999999/csv")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(SUBMISSION_PATH + "/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("완료 처리는 200 과 전이 요약을 반환하고 예약을 CONFIRMED 로 바꾼다")
    void completeReturns200WithSummary() {
        FacilityBooking booking = approvedBooking(9);
        Integer batchId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("bookingIds", List.of(booking.getId())))
                .when().post(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.batchId");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(SUBMISSION_PATH + "/" + batchId + "/complete")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalCount", equalTo(1))
                .body("data.confirmedCount", equalTo(1))
                .body("data.skippedCount", equalTo(0))
                .body("data.completedAt", notNullValue())
                .body("data.skippedBookings", notNullValue());

        Assertions.assertThat(bookingRepository.findById(booking.getId()).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);

        // 기완료 재요청 409, 완료 후 취소 409, 완료 후 CSV 재다운로드 허용(§9)
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(SUBMISSION_PATH + "/" + batchId + "/complete")
                .then().statusCode(HttpStatus.CONFLICT.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.CONFLICT.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId + "/csv")
                .then().statusCode(HttpStatus.OK.value());

        // 목록에 completed 노출 + 상세에 감사 이력(요약 detail 포함) 노출
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].completed", is(true));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.batch.completed", is(true))
                .body("data.audits.action", org.hamcrest.Matchers.hasItems("CREATED", "COMPLETED", "VIEWED"))
                .body("data.audits.find { it.action == 'COMPLETED' }.detail",
                        org.hamcrest.Matchers.containsString("학교 제출 완료"));
    }

    @Test
    @DisplayName("상태가 변한 예약이 있으면 완료 응답에 제외 사유가 사람이 읽는 형태로 실린다")
    void completeExcludesStatusChangedBookingWithHumanReadableReason() {
        FacilityBooking staleBooking = approvedBooking(9);
        FacilityBooking confirmableBooking = approvedBooking(11);
        Integer batchId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("bookingIds", List.of(staleBooking.getId(), confirmableBooking.getId())))
                .when().post(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.batchId");

        FacilityBooking cancelledBooking = bookingRepository.findById(staleBooking.getId()).orElseThrow();
        cancelledBooking.cancelByAdmin();
        bookingRepository.save(cancelledBooking);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(SUBMISSION_PATH + "/" + batchId + "/complete")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalCount", equalTo(2))
                .body("data.confirmedCount", equalTo(1))
                .body("data.skippedCount", equalTo(1))
                .body("data.skippedBookings[0].bookingId", equalTo(staleBooking.getId().intValue()))
                .body("data.skippedBookings[0].status", equalTo("CANCELLED"))
                .body("data.skippedBookings[0].reason", equalTo("취소됨"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.audits.find { it.action == 'COMPLETED' }.adminName", equalTo(admin.getName()))
                .body("data.audits.find { it.action == 'COMPLETED' }.ipAddress", notNullValue());
    }

    @Test
    @DisplayName("완료 처리도 익명 401·일반 사용자 403·미존재 404 규약을 따른다")
    void completeAuthAndNotFoundContracts() {
        RestAssured.given()
                .when().post(SUBMISSION_PATH + "/1/complete")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().post(SUBMISSION_PATH + "/1/complete")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(SUBMISSION_PATH + "/999999/complete")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }
}
