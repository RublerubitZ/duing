package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.dto.query.FacilityWeeklyOccupancyQuery.FacilityRow;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityWeeklyOccupancyQueryServiceTest extends IntegrationTestBase {

    /** KST 2026-11-04(수) 14:00 — 10/26 주는 10월·11월에 걸치고 이번 달은 11월이다. */
    private static final Clock WEDNESDAY_CLOCK = Clock.fixed(Instant.parse("2026-11-04T05:00:00Z"), ZoneId.of("Asia/Seoul"));
    private static final LocalDate WEEK_START = LocalDate.of(2026, 10, 26);

    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityBookingRepository facilityBookingRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    @Autowired FacilityAvailabilityPolicy availabilityPolicy;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(1);
    private Long applicantId;
    private Long clubId;

    @BeforeEach
    void setUp() {
        applicantId = userRepository.save(UserFixture.unique()).getId();
        clubId = clubRepository.save(ClubFixture.academic("예약동아리")).getId();
    }

    private FacilityWeeklyOccupancyQueryService service() {
        return new FacilityWeeklyOccupancyQueryService(facilityRepository, facilityBookingRepository,
                facilityReservationRepository, facilityMonthSnapshotRepository, availabilityPolicy, WEDNESDAY_CLOCK);
    }

    @Test
    @DisplayName("칸은 승인·확정 예약과 학교 실예약이 걸친 1시간 칸이다 — 겹치면 한 번, 30분 걸침은 두 칸, 검토 중·반려·기본 확보 시간은 빼고 수기 확정은 센다")
    void countsOccupiedSlotsLikeTheBookingCalendar() {
        Facility hall = saveFacility("강당", 1);
        LocalDate wednesday = WEEK_START.plusDays(2);
        approve(hall, wednesday, LocalTime.of(10, 0), LocalTime.of(12, 0));                 // 10·11시
        confirmManually(hall, wednesday, LocalTime.of(13, 30), LocalTime.of(15, 0));        // 13·14시(30분 걸침)
        saveBooking(hall, wednesday, LocalTime.of(16, 0), LocalTime.of(17, 0));             // 검토 중 — 빠진다
        reject(hall, wednesday, LocalTime.of(17, 0), LocalTime.of(18, 0));                  // 반려 — 빠진다
        crawl(hall, wednesday, LocalTime.of(11, 0), LocalTime.of(12, 0), "학교 행사", false); // 내부 예약과 겹침 — 한 번
        crawl(hall, wednesday, LocalTime.of(19, 0), LocalTime.of(20, 0), "학교 강연", false); // 19시
        Club securedClub = ClubFixture.academic("확보동아리");
        securedClub.changeFacilitySecuredTimeTarget(true);
        clubRepository.save(securedClub);
        crawl(hall, wednesday, LocalTime.of(20, 0), LocalTime.of(21, 0), "확보동아리", true); // 기본 확보 시간 — 빠진다

        FacilityRow row = service().getWeeklyOccupancy(WEEK_START).facilities().get(0);

        assertThat(row.facilityId()).isEqualTo(hall.getId());
        assertThat(row.roomName()).isEqualTo("강당");
        assertThat(row.occupiedSlotCounts()).containsExactly(0, 0, 5, 0, 0, 0, 0);
    }

    @Test
    @DisplayName("운영 시간(09~22시)에 걸친 학교 실예약은 안쪽 칸만 센다 — 08:30–09:30 은 9시, 21:30–23:00 은 21시 한 칸, 22:00–23:00 은 0칸")
    void countsOnlySlotsInsideOperatingHours() {
        Facility hall = saveFacility("강당", 1);
        // 두잉 예약은 chk_facility_booking_time(V82)이 09~22시 안으로 막는다 — 운영 시간 밖에 걸치는 것은 학교 일정(크롤 행)뿐이다.
        crawl(hall, WEEK_START.plusDays(1), LocalTime.of(8, 30), LocalTime.of(9, 30), "학교 행사", false);
        crawl(hall, WEEK_START.plusDays(1), LocalTime.of(21, 30), LocalTime.of(23, 0), "학교 행사", false);
        crawl(hall, WEEK_START.plusDays(3), LocalTime.of(22, 0), LocalTime.of(23, 0), "학교 행사", false);

        assertThat(service().getWeeklyOccupancy(WEEK_START).facilities().get(0).occupiedSlotCounts())
                .containsExactly(0, 2, 0, 0, 0, 0, 0);
    }

    @Test
    @DisplayName("주가 두 달에 걸치면 두 달의 학교 일정을 함께 읽고, 주 밖 날짜는 칸에 넣지 않는다")
    void readsCrawlRowsOfBothMonths() {
        Facility hall = saveFacility("강당", 1);
        crawl(hall, LocalDate.of(2026, 10, 31), LocalTime.of(10, 0), LocalTime.of(11, 0), "학교 행사", false);
        crawl(hall, LocalDate.of(2026, 11, 1), LocalTime.of(10, 0), LocalTime.of(12, 0), "학교 행사", false);
        crawl(hall, LocalDate.of(2026, 11, 2), LocalTime.of(10, 0), LocalTime.of(12, 0), "학교 행사", false);

        assertThat(service().getWeeklyOccupancy(WEEK_START).facilities().get(0).occupiedSlotCounts())
                .containsExactly(0, 0, 0, 0, 0, 1, 2);
    }

    @Test
    @DisplayName("보관한 시설은 빠지고 시설은 sort_order 순이다 — 예약이 없는 시설도 0 칸 7개로 남는다")
    void excludesArchivedFacilitiesAndKeepsSortOrder() {
        saveFacility("세미나실", 2);
        saveFacility("강당", 1);
        Facility archived = saveFacility("보관실", 0);
        approve(archived, WEEK_START, LocalTime.of(10, 0), LocalTime.of(11, 0));
        archived.archive(LocalDateTime.now(WEDNESDAY_CLOCK));
        facilityRepository.save(archived);

        List<FacilityRow> rows = service().getWeeklyOccupancy(WEEK_START).facilities();

        assertThat(rows).extracting(FacilityRow::roomName).containsExactly("강당", "세미나실");
        assertThat(rows).allSatisfy(row -> assertThat(row.occupiedSlotCounts()).hasSize(7).containsOnly(0));
    }

    @Test
    @DisplayName("sort_order 가 같은 시설은 id 순이다 — 먼저 만든 시설이 보관됐다 복구돼도 앞에 온다")
    void ordersTiedSortOrderById() {
        Facility first = saveFacility("강당", 1);
        Facility second = saveFacility("세미나실", 1);
        // 색인 열(archived_at)을 바꿔 HOT 아닌 UPDATE 로 먼저 만든 행을 힙·색인 뒤로 보낸다 — 이름만 바꾸면
        // HOT 갱신이라 archived_at 색인 스캔이 넣은 순서대로 읽어, 정렬 줄이 없어도 통과한다.
        first.archive(LocalDateTime.now(WEDNESDAY_CLOCK));
        facilityRepository.save(first);
        first.restore();
        facilityRepository.save(first);

        assertThat(service().getWeeklyOccupancy(WEEK_START).facilities())
                .extracting(FacilityRow::facilityId).containsExactly(first.getId(), second.getId());
    }

    @Test
    @DisplayName("이번 달(서버 시계) 학교 일정 수집 시각을 주고, 그 달 기록이 없으면 null 이다")
    void returnsCurrentMonthCrawledAt() {
        assertThat(service().getWeeklyOccupancy(WEEK_START).currentMonthCrawledAt()).isNull();

        facilityMonthSnapshotRepository.save(FacilityMonthSnapshot.create(YearMonth.of(2026, 10),
                LocalDateTime.of(2026, 10, 31, 9, 0), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null));
        facilityMonthSnapshotRepository.save(FacilityMonthSnapshot.create(YearMonth.of(2026, 11),
                LocalDateTime.of(2026, 11, 4, 9, 0), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null));

        assertThat(service().getWeeklyOccupancy(WEEK_START).currentMonthCrawledAt())
                .isEqualTo(LocalDateTime.of(2026, 11, 4, 9, 0));
    }

    private Facility saveFacility(String roomName, int sortOrder) {
        return facilityRepository.save(Facility.create((int) sequence.incrementAndGet(), roomName, "학생회관", sortOrder));
    }

    private FacilityBooking saveBooking(Facility facility, LocalDate date, LocalTime start, LocalTime end) {
        return facilityBookingRepository.save(FacilityBooking.request(facility.getId(), clubId, applicantId, date,
                start, end, "정기 모임", 10, "010-1234-5678"));
    }

    private void approve(Facility facility, LocalDate date, LocalTime start, LocalTime end) {
        FacilityBooking booking = saveBooking(facility, date, start, end);
        booking.approve(applicantId, LocalDateTime.now(WEDNESDAY_CLOCK), LocalDateTime.now(WEDNESDAY_CLOCK));
        facilityBookingRepository.save(booking);
    }

    private void confirmManually(Facility facility, LocalDate date, LocalTime start, LocalTime end) {
        FacilityBooking booking = saveBooking(facility, date, start, end);
        booking.approve(applicantId, LocalDateTime.now(WEDNESDAY_CLOCK), LocalDateTime.now(WEDNESDAY_CLOCK));
        booking.confirmManually(LocalDateTime.now(WEDNESDAY_CLOCK));
        facilityBookingRepository.save(booking);
    }

    private void reject(Facility facility, LocalDate date, LocalTime start, LocalTime end) {
        FacilityBooking booking = saveBooking(facility, date, start, end);
        booking.reject(applicantId, "일정 겹침", LocalDateTime.now(WEDNESDAY_CLOCK));
        facilityBookingRepository.save(booking);
    }

    private void crawl(Facility facility, LocalDate date, LocalTime start, LocalTime end, String organization,
                       boolean securedTail) {
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(), sequence.incrementAndGet(),
                YearMonth.from(date), date, start, end, organization, securedTail, LocalDateTime.now(WEDNESDAY_CLOCK)));
    }
}
