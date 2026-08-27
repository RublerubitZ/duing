package com.duing.domain.facilitybooking.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.BookingWindowFixture;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilityBookingService;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
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

/**
 * 총동연 대관 관리자 API 의 HTTP 레벨 인수 테스트.
 *
 * <p>ADMIN·STUDENT 토큰 발급과 RestAssured 요청 방식은
 * {@code AdminUrlLayerAuthorizationAcceptanceTest}(global/config) 의 헬퍼 방식을 그대로 따른다.
 * PENDING 신청 생성 픽스처(saveActiveClub/saveFacility/pendingBooking 등)는 같은 도메인의
 * {@code FacilityBookingAdminServiceIntegrationTest} 코드를 복제한다(사이드 파일 패턴 일치).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFacilityBookingAcceptanceTest extends IntegrationTestBase {

    private static final String QUEUE_PATH = "/api/v1/admin/facility-bookings";
    private static final String SUMMARY_PATH = "/api/v1/admin/facility-bookings/summary";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingService bookingService;

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
                .when().get(QUEUE_PATH)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(QUEUE_PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("summary 경로가 상세 템플릿에 삼켜지지 않고 200 + counts 필드를 반환한다")
    void summaryPathIsNotSwallowedByDetailTemplate() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUMMARY_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.pendingCount", notNullValue())
                .body("data.confirmedThisMonthCount", notNullValue());
    }

    @Test
    @DisplayName("승인 액션은 204 를 반환하고 상태를 APPROVED 로 바꾼다")
    void approveActionReturns204AndChangesStatus() throws Exception {
        Long bookingId = pendingBooking();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(QUEUE_PATH + "/" + bookingId + "/approve")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        FacilityBooking approved = bookingRepository.findById(bookingId).orElseThrow();
        Assertions.assertThat(approved.getStatus()).isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("승인 시 학교 점유행과 겹치면 409 + code·conflicts payload(§8.3) 를 반환한다")
    void approveConflictReturns409WithPayload() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Facility facility = saveFacility();
        LocalDate date = BookingWindowFixture.bookableDate();
        Long bookingId = bookingService.create(new CreateFacilityBookingCommand(
                club.getId(), leader.getId(), facility.getId(), date,
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
        // 신청 이후 겹치는 학교 점유행(꼬리 없음)이 크롤로 유입 — 승인 재검증에 걸려 409 가 되어야 한다
        facilityReservationRepository.save(FacilityReservation.create(
                facility.getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), "문화팀", false, LocalDateTime.now()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(QUEUE_PATH + "/" + bookingId + "/approve")
                .then().statusCode(HttpStatus.CONFLICT.value())
                .body("ok", is(false))
                .body("code", equalTo("FACILITY_BOOKING_SCHOOL_CONFLICT"))
                .body("data.conflicts", notNullValue())
                .body("data.conflicts[0].source", equalTo("SCHOOL"))
                .body("data.conflicts[0].organization", equalTo("문화팀"))
                // crawlBasisAt 은 검증에 사용한 시설 행 세대(주입한 점유행의 crawledAt) — 절대시각(Instant, …Z)으로 실린다.
                .body("data.crawlBasisAt", notNullValue());

        Assertions.assertThat(bookingRepository.findById(bookingId).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.PENDING);
    }

    @Test
    @DisplayName("관리자 큐 응답(JSON)은 신청의 대표 연락처를 노출한다")
    void queueExposesContactPhone() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Facility facility = saveFacility();
        bookingService.create(new CreateFacilityBookingCommand(
                club.getId(), leader.getId(), facility.getId(), BookingWindowFixture.bookableDate(),
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(QUEUE_PATH + "?facilityId=" + facility.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].contactPhone", equalTo(FacilityBookingFixture.VALID_CONTACT_PHONE));
    }

    // ---------- fixtures (FacilityBookingAdminServiceIntegrationTest 와 동일) ----------

    private Long pendingBooking() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Facility facility = saveFacility();
        // 시각 무관 항상 신청 가능한 날짜(내일) — 롤링 창은 오늘을 포함하나 고정 슬롯 시각 타임밤을 피해 내일을 쓴다.
        LocalDate date = BookingWindowFixture.bookableDate();
        return bookingService.create(new CreateFacilityBookingCommand(
                club.getId(), leader.getId(), facility.getId(), date,
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("대관동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        club.changeCentralClub(true); // 시설 예약 신청은 중앙동아리만 가능(설계 spec 2026-07-18)
        return clubRepository.save(club);
    }

    private Facility saveFacility() {
        return facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }
}
