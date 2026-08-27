package com.duing.domain.facilitybooking.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.controller.dto.response.BookingWindowResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.OperatingNote;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotBlockSource;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.BookingWindow;
import com.duing.domain.facilitybooking.service.BookingWindowPolicy;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityService;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
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
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired BookingWindowPolicy bookingWindowPolicy;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;

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
    @DisplayName("크롤 데이터가 없는 시설은 예약 오픈 창의 미래 날짜가 종일 AVAILABLE 이다")
    void availabilityForEmptyMonth() {
        Facility facility = facilityRepository.save(Facility.create(90001, "커뮤니티룸(T)", null, 0));

        FacilityAvailabilityResponse response =
                availabilityService.getAvailability(facility.getId(), YearMonth.now(clock));

        // bookableFrom·bookableUntil 은 롤링 오픈 정책이 계산한 현재 창과 정확히 일치해야 한다(익월말 고정 아님).
        BookingWindow window = bookingWindowPolicy.windowFor(LocalDate.now(clock));
        assertThat(response.days()).hasSize(YearMonth.now(clock).lengthOfMonth());
        assertThat(response.bookableFrom()).isEqualTo(window.from());
        assertThat(response.bookableUntil()).isEqualTo(window.until());
        assertThat(response.stale()).isTrue();
        assertThat(response.days().get(response.days().size() - 1).slots()).hasSize(13);

        // 창의 마지막 날(다음 반월 말일)은 항상 미래이고 크롤·예약이 없으므로 그날 슬롯 13칸이 전부 AVAILABLE 이다.
        // (창의 첫날은 롤링 전환으로 오늘이라 지난 슬롯이 PAST 가 될 수 있어, 시각 무관 검증에는 미래 날짜를 쓴다.)
        FacilityAvailabilityResponse windowEndMonth =
                availabilityService.getAvailability(facility.getId(), YearMonth.from(window.until()));
        FacilityAvailabilityResponse.DayAvailability lastBookableDay = windowEndMonth.days().stream()
                .filter(dayAvailability -> dayAvailability.date().equals(window.until()))
                .findFirst()
                .orElseThrow();
        assertThat(lastBookableDay.availableSlotCount()).isEqualTo(13);
        assertThat(lastBookableDay.slots()).allSatisfy(slot ->
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
    @DisplayName("예약 오픈 구간 API 는 비로그인으로 단일 창과 현재·다음 세부 구간 2개를 반환한다")
    void bookingWindowMatchesAvailabilityWindow() {
        BookingWindow expected = bookingWindowPolicy.windowFor(LocalDate.now(clock));

        BookingWindowResponse response = RestAssured.given()
                .when().get("/api/v1/facilities/booking-window")
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath().getObject("data", BookingWindowResponse.class);

        assertThat(response.bookableFrom()).isEqualTo(expected.from());
        assertThat(response.bookableUntil()).isEqualTo(expected.until());
        assertThat(response.availableBookingRanges()).hasSize(2);
        assertThat(response.availableBookingRanges().get(0).startDate()).isEqualTo(expected.openRanges().get(0).from());
        assertThat(response.availableBookingRanges().get(0).endDate()).isEqualTo(expected.openRanges().get(0).until());
        assertThat(response.availableBookingRanges().get(0).label()).isEqualTo("현재 예약 가능");
        assertThat(response.availableBookingRanges().get(1).startDate()).isEqualTo(expected.openRanges().get(1).from());
        assertThat(response.availableBookingRanges().get(1).endDate()).isEqualTo(expected.openRanges().get(1).until());
        assertThat(response.availableBookingRanges().get(1).label()).isEqualTo("다음 예약 가능");
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

    @Test
    @DisplayName("내부 APPROVED 예약 슬롯은 BLOCKED(INTERNAL)로 동아리명을 노출하고, 동아리가 삭제되면 organization 이 null 로 폴백한다")
    void internalApprovedBookingExposesClubName() {
        Facility facility = facilityRepository.save(Facility.create(90004, "커뮤니티룸(T4)", null, 0));
        Club club = clubRepository.save(Club.create("가야금연구회", ClubCategory.OTHER, "분과", "설명", null));
        // applicant_id·decided_by 는 users FK 라 실제 유저가 있어야 저장된다(신청자 겸 승인자로 재사용).
        User applicant = userRepository.save(User.create("2020123456", "신청자", "hashed",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now(clock)));
        // 내일 슬롯을 쓴다 — 오늘이면 지난 슬롯이 PAST 가 되어 시각 의존 실패가 나므로 항상 미래인 날짜를 고른다.
        LocalDate bookingDate = LocalDate.now(clock).plusDays(1);

        FacilityBooking booking = FacilityBooking.request(facility.getId(), club.getId(), applicant.getId(),
                bookingDate, LocalTime.of(10, 0), LocalTime.of(11, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(applicant.getId(), null, LocalDateTime.now(clock));
        bookingRepository.save(booking);

        FacilityAvailabilityResponse response =
                availabilityService.getAvailability(facility.getId(), YearMonth.from(bookingDate));
        SlotAvailability slot = slotAt(response, bookingDate, "10:00");
        assertThat(slot.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(slot.blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        // 승인 완료 예약은 크롤 SCHOOL 행으로 어차피 실명 공개되므로 동아리명을 노출한다(2026-07-17 사용자 결정 §4⁗.1).
        assertThat(slot.organization()).isEqualTo(club.getName());

        // soft-delete 된 동아리는 findAllById 에서 제외되어 이름을 못 찾으므로 organization=null 로 폴백하되
        // BLOCKED(INTERNAL) 은 유지한다(FE '예약됨' 폴백).
        clubRepository.delete(club);
        FacilityAvailabilityResponse afterDelete =
                availabilityService.getAvailability(facility.getId(), YearMonth.from(bookingDate));
        SlotAvailability fallbackSlot = slotAt(afterDelete, bookingDate, "10:00");
        assertThat(fallbackSlot.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(fallbackSlot.blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        assertThat(fallbackSlot.organization()).isNull();
    }

    @Test
    @DisplayName("공개 가용성·예약 오픈 구간 응답은 신청의 대표 연락처(PII)를 노출하지 않는다")
    void publicEndpointsDoNotExposeContactPhone() {
        Facility facility = facilityRepository.save(Facility.create(90005, "커뮤니티룸(T5)", null, 0));
        Club club = clubRepository.save(Club.create("비공개연락처동아리", ClubCategory.OTHER, "분과", "설명", null));
        User applicant = userRepository.save(User.create("2020987654", "신청자", "hashed",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now(clock)));
        LocalDate bookingDate = LocalDate.now(clock).plusDays(1);
        // 식별 가능한 유일 연락처 — 공개 응답 어디에도 이 값이 새면 안 된다.
        String secretContactPhone = "010-7654-3210";
        FacilityBooking booking = FacilityBooking.request(facility.getId(), club.getId(), applicant.getId(),
                bookingDate, LocalTime.of(10, 0), LocalTime.of(11, 0), "정기 합주", null, secretContactPhone);
        booking.approve(applicant.getId(), null, LocalDateTime.now(clock));
        bookingRepository.save(booking);

        String availabilityBody = RestAssured.given()
                .when().get("/api/v1/facilities/" + facility.getId() + "/availability?yearMonth="
                        + YearMonth.from(bookingDate))
                .then().statusCode(HttpStatus.OK.value())
                .extract().asString();
        assertThat(availabilityBody).doesNotContain(secretContactPhone).doesNotContain("contactPhone");

        String windowBody = RestAssured.given()
                .when().get("/api/v1/facilities/booking-window")
                .then().statusCode(HttpStatus.OK.value())
                .extract().asString();
        assertThat(windowBody).doesNotContain(secretContactPhone).doesNotContain("contactPhone");
    }

    @Test
    @DisplayName("기본 확보 시간 대상 동아리 행은 차단하지 않고(AVAILABLE), 실예약 행만 SCHOOL 로 차단한다 — 플래그 OFF 시 즉시 재차단")
    void securedTargetRowsDoNotBlockWhileCrawledRowsDo() {
        Facility facility = facilityRepository.save(Facility.create(90006, "커뮤니티룸(T6)", null, 0));
        Club securedClub = clubRepository.save(Club.create("고정관념", ClubCategory.OTHER, "분과", "설명", null));
        securedClub.changeFacilitySecuredTimeTarget(true);
        clubRepository.save(securedClub);
        clubRepository.save(Club.create("ABC동아리", ClubCategory.OTHER, "분과", "설명", null)); // 플래그 OFF 등록 동아리
        LocalDate crawlDate = LocalDate.now(clock).plusDays(1);
        LocalDateTime crawledAt = LocalDateTime.now(clock);
        // 파서가 꼬리 범위를 확장 저장한 형태의 행들: 고정관념 [10,13) / 상담센터 [13,15) / ABC동아리 [15,17)
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(), 91001L,
                YearMonth.from(crawlDate), crawlDate, LocalTime.of(10, 0), LocalTime.of(13, 0), "고정관념", crawledAt));
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(), 91002L,
                YearMonth.from(crawlDate), crawlDate, LocalTime.of(13, 0), LocalTime.of(15, 0), "학생생활상담센터", crawledAt));
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(), 91003L,
                YearMonth.from(crawlDate), crawlDate, LocalTime.of(15, 0), LocalTime.of(17, 0), "ABC동아리", crawledAt));

        FacilityAvailabilityResponse response =
                availabilityService.getAvailability(facility.getId(), YearMonth.from(crawlDate));

        // 기본 확보 시간 대상 동아리 — 실범위 전 구간 AVAILABLE(2026-08-27 비차단 전환, 다른 동아리 신청 가능).
        for (String start : new String[] {"10:00", "11:00", "12:00"}) {
            SlotAvailability slot = slotAt(response, crawlDate, start);
            assertThat(slot.status()).isEqualTo(SlotStatus.AVAILABLE);
            assertThat(slot.blockedBy()).isNull();
            assertThat(slot.organization()).isNull();
        }
        // 미등록 기관·플래그 OFF 등록 동아리 — 전부 SCHOOL 차단(fail-closed, 매칭 여부는 차단 조건이 아니다).
        assertThat(slotAt(response, crawlDate, "13:00").blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        assertThat(slotAt(response, crawlDate, "14:00").organization()).isEqualTo("학생생활상담센터");
        assertThat(slotAt(response, crawlDate, "15:00").blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        assertThat(slotAt(response, crawlDate, "16:00").organization()).isEqualTo("ABC동아리");
        // 경계 슬롯(09~10, 17~18)은 차단되지 않는다(반개구간).
        assertThat(slotAt(response, crawlDate, "09:00").status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(slotAt(response, crawlDate, "17:00").status()).isEqualTo(SlotStatus.AVAILABLE);
        // availableSlotCount 는 차단 목록 변화를 자동 추종한다 — 실예약 4칸(13~17)만 차단이므로 9.
        FacilityAvailabilityResponse.DayAvailability crawlDay = response.days().stream()
                .filter(dayAvailability -> dayAvailability.date().equals(crawlDate))
                .findFirst().orElseThrow();
        assertThat(crawlDay.availableSlotCount()).isEqualTo(9);
        // 확보 행은 표시 전용 operatingNotes 로 내려간다 — 차단 아님(v2 스펙 §3). 실예약 행 2건은 미포함.
        assertThat(crawlDay.operatingNotes()).containsExactly(new OperatingNote("고정관념", "10:00", "13:00"));

        // 플래그 OFF 로 바꾸면 재크롤 없이 같은 행이 즉시 CRAWLED(SCHOOL)로 재분류되어 다시 차단된다(수정 6).
        securedClub.changeFacilitySecuredTimeTarget(false);
        clubRepository.save(securedClub);
        FacilityAvailabilityResponse afterToggle =
                availabilityService.getAvailability(facility.getId(), YearMonth.from(crawlDate));
        SlotAvailability reclassified = slotAt(afterToggle, crawlDate, "10:00");
        assertThat(reclassified.status()).isEqualTo(SlotStatus.BLOCKED); // 확보 해제 즉시 재차단(소급 없는 조회 시점 파생)
        assertThat(reclassified.blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        // 확보 미지정 상태에서는 표시 데이터 소스가 없으므로 operatingNotes 가 빈 배열이다.
        FacilityAvailabilityResponse.DayAvailability afterToggleDay = afterToggle.days().stream()
                .filter(dayAvailability -> dayAvailability.date().equals(crawlDate))
                .findFirst().orElseThrow();
        assertThat(afterToggleDay.operatingNotes()).isEmpty();
    }

    private SlotAvailability slotAt(FacilityAvailabilityResponse response, LocalDate date, String start) {
        return response.days().stream()
                .filter(dayAvailability -> dayAvailability.date().equals(date))
                .flatMap(dayAvailability -> dayAvailability.slots().stream())
                .filter(slot -> slot.start().equals(start))
                .findFirst()
                .orElseThrow();
    }
}
