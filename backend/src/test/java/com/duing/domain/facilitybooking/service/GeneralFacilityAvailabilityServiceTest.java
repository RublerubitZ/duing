package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.never;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotBlockSource;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingPurposePresetRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 가용성 서비스의 시간대·월 범위 판정 단위 테스트 — Clock.fixed(Asia/Seoul) 로 UTC 인스턴트를 KST 벽시계에 대응시켜
 * 마감 경계(전날 12:00 KST)와 직전 월 열람(재크롤 없음·스냅샷 완결성 stale)을 결정적으로 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class GeneralFacilityAvailabilityServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final long FACILITY_ID = 1L;
    /** 과거 오픈일 — 창 하한이 오늘로 clamp 되어 "이미 열린 시설" 을 뜻한다. */
    private static final LocalDate BOOKING_OPEN_SINCE = LocalDate.of(2020, 1, 1);

    @Mock FacilityRepository facilityRepository;
    @Mock FacilityReservationRepository facilityReservationRepository;
    @Mock FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    @Mock FacilityBookingRepository facilityBookingRepository;
    @Mock FacilityBookingPurposePresetRepository purposePresetRepository;
    @Mock ClubRepository clubRepository;
    @Mock FacilityCrawlService facilityCrawlService;
    @Mock FacilityAvailabilityPolicy availabilityPolicy;

    private GeneralFacilityAvailabilityService serviceAt(String utcInstant) {
        Clock clock = Clock.fixed(Instant.parse(utcInstant), SEOUL);
        BookingApplicationPolicy applicationPolicy = new BookingApplicationPolicy(clock);
        return new GeneralFacilityAvailabilityService(facilityRepository, facilityReservationRepository,
                facilityMonthSnapshotRepository, facilityBookingRepository, purposePresetRepository,
                clubRepository, facilityCrawlService, availabilityPolicy, applicationPolicy, clock);
    }

    private void stubFacility() {
        stubFacility(BOOKING_OPEN_SINCE);
    }

    private void stubFacility(LocalDate bookingOpenDate) {
        Facility facility = Facility.create(90001, "커뮤니티룸(T)", null, 0);
        facility.changeBookingOpenDate(bookingOpenDate);
        ReflectionTestUtils.setField(facility, "id", FACILITY_ID);
        given(facilityRepository.findById(FACILITY_ID)).willReturn(Optional.of(facility));
    }

    private static SlotAvailability slotAt(FacilityAvailabilityResponse response, LocalDate date, int startHour) {
        return response.days().get(date.getDayOfMonth() - 1).slots().get(startHour - 9);
    }

    @Test
    @DisplayName("KST 마감 경계: UTC 03:00:59(=KST 12:00:59)엔 익일 빈 슬롯 AVAILABLE, UTC 03:01:00(=KST 12:01:00)엔 DEADLINE_PASSED, 이틀 뒤는 AVAILABLE")
    void kstDeadlineBoundaryDrivesSlotStatus() {
        YearMonth january = YearMonth.of(2026, 1);
        LocalDate tomorrow = LocalDate.of(2026, 1, 16);
        given(facilityCrawlService.ensureFresh(january)).willReturn(DataSource.CACHE);
        stubFacility();

        FacilityAvailabilityResponse beforeCutoff =
                serviceAt("2026-01-15T03:00:59Z").getAvailability(FACILITY_ID, january);
        assertThat(slotAt(beforeCutoff, tomorrow, 9).status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(beforeCutoff.days().get(tomorrow.getDayOfMonth() - 1).applicationClosed()).isFalse();

        FacilityAvailabilityResponse afterCutoff =
                serviceAt("2026-01-15T03:01:00Z").getAvailability(FACILITY_ID, january);
        assertThat(slotAt(afterCutoff, tomorrow, 9).status()).isEqualTo(SlotStatus.DEADLINE_PASSED);
        assertThat(afterCutoff.days().get(tomorrow.getDayOfMonth() - 1).applicationClosed()).isTrue();
        assertThat(slotAt(afterCutoff, tomorrow.plusDays(1), 9).status()).isEqualTo(SlotStatus.AVAILABLE);
    }

    @Test
    @DisplayName("직전 월 조회는 온디맨드 재크롤 없이 저장 스냅샷을 그대로 내리고, 크롤 점유 행은 지난 날짜에서도 BLOCKED(SCHOOL)로 보존된다")
    void previousMonthServesStoredSnapshotWithoutRecrawl() {
        YearMonth january = YearMonth.of(2026, 1);
        LocalDate recordDate = LocalDate.of(2026, 1, 20);
        LocalDateTime crawledAt = LocalDateTime.of(2026, 1, 31, 23, 50);
        stubFacility();
        given(facilityReservationRepository.findByFacilityIdAndYearMonth(FACILITY_ID, january)).willReturn(List.of(
                FacilityReservation.create(FACILITY_ID, 5001L, january, recordDate,
                        LocalTime.of(10, 0), LocalTime.of(12, 0), "비호응원단", false, crawledAt)));
        given(availabilityPolicy.classify(any(), any())).willReturn(CrawlRowType.CRAWLED_RESERVATION);
        given(facilityMonthSnapshotRepository.findByYearMonth(january)).willReturn(Optional.of(
                FacilityMonthSnapshot.create(january, crawledAt, CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null)));

        // 2026-02-10 12:00 KST — 1월은 직전 월
        FacilityAvailabilityResponse response =
                serviceAt("2026-02-10T03:00:00Z").getAvailability(FACILITY_ID, january);

        then(facilityCrawlService).should(never()).ensureFresh(any());
        assertThat(response.yearMonth()).isEqualTo("2026-01");
        assertThat(response.days()).hasSize(31);
        assertThat(response.stale()).isFalse();
        assertThat(response.lastUpdatedAt()).isEqualTo(crawledAt.atZone(SEOUL).toInstant());
        for (int hour : new int[] {10, 11}) {
            SlotAvailability slot = slotAt(response, recordDate, hour);
            assertThat(slot.status()).isEqualTo(SlotStatus.BLOCKED);
            assertThat(slot.blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
            assertThat(slot.organization()).isEqualTo("비호응원단");
        }
        assertThat(slotAt(response, recordDate, 9).status()).isEqualTo(SlotStatus.PAST);
        assertThat(response.days().get(recordDate.getDayOfMonth() - 1).dayStatus())
                .isEqualTo(FacilityAvailabilityResponse.DayStatus.PAST);
    }

    @Test
    @DisplayName("직전 월 스냅샷이 없거나 SUCCESS 가 아니면 stale=true 다(TTL 아닌 기록 완결성 판정) — 역시 재크롤은 없다")
    void previousMonthWithoutSuccessfulSnapshotIsStale() {
        YearMonth january = YearMonth.of(2026, 1);
        stubFacility();

        FacilityAvailabilityResponse missing =
                serviceAt("2026-02-10T03:00:00Z").getAvailability(FACILITY_ID, january);
        assertThat(missing.stale()).isTrue();
        assertThat(missing.lastUpdatedAt()).isNull();

        given(facilityMonthSnapshotRepository.findByYearMonth(january)).willReturn(Optional.of(
                FacilityMonthSnapshot.create(january, LocalDateTime.of(2026, 1, 31, 23, 50),
                        CrawlSource.SCHEDULER, FetchStatus.PARTIAL, "일부 실패")));
        FacilityAvailabilityResponse partial =
                serviceAt("2026-02-10T03:00:00Z").getAvailability(FACILITY_ID, january);
        assertThat(partial.stale()).isTrue();

        then(facilityCrawlService).should(never()).ensureFresh(any());
    }

    @Test
    @DisplayName("열람 범위는 직전 월·당월·익월 — 두 달 전·두 달 뒤는 400 예외이고, 당월·익월은 기존대로 ensureFresh 를 탄다")
    void viewableRangeIsPreviousCurrentAndNextMonth() {
        GeneralFacilityAvailabilityService service = serviceAt("2026-02-10T03:00:00Z");

        assertThatThrownBy(() -> service.getAvailability(FACILITY_ID, YearMonth.of(2025, 12)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
        assertThatThrownBy(() -> service.getAvailability(FACILITY_ID, YearMonth.of(2026, 4)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);

        stubFacility();
        given(facilityCrawlService.ensureFresh(any())).willReturn(DataSource.CACHE);
        service.getAvailability(FACILITY_ID, YearMonth.of(2026, 2));
        service.getAvailability(FACILITY_ID, YearMonth.of(2026, 3));
        then(facilityCrawlService).should().ensureFresh(YearMonth.of(2026, 2));
        then(facilityCrawlService).should().ensureFresh(YearMonth.of(2026, 3));
    }

    @Test
    @DisplayName("신청 창은 시설 오픈일에서 나온다 — 미래 오픈일이 bookableFrom 이고 상한은 익월 말일이다")
    void bookableRangeFollowsFacilityOpenDate() {
        YearMonth january = YearMonth.of(2026, 1);
        given(facilityCrawlService.ensureFresh(january)).willReturn(DataSource.CACHE);
        stubFacility(LocalDate.of(2026, 1, 20)); // 오늘(1/15) + 5일

        FacilityAvailabilityResponse response =
                serviceAt("2026-01-15T03:00:00Z").getAvailability(FACILITY_ID, january);

        assertThat(response.bookableFrom()).isEqualTo(LocalDate.of(2026, 1, 20));
        assertThat(response.bookableUntil()).isEqualTo(LocalDate.of(2026, 2, 28));
        // 오픈 전 날짜의 슬롯 표시는 바뀌지 않는다(P5) — 서버는 AVAILABLE 로 내리고 FE 가 창으로 게이팅한다.
        assertThat(slotAt(response, LocalDate.of(2026, 1, 17), 9).status()).isEqualTo(SlotStatus.AVAILABLE);
    }

    @Test
    @DisplayName("오픈일이 없는 시설은 빈 창(시작 = 익월 말일 + 1)으로 내려가고 슬롯은 그대로 AVAILABLE 이다")
    void facilityWithoutOpenDateReturnsEmptyWindow() {
        YearMonth january = YearMonth.of(2026, 1);
        given(facilityCrawlService.ensureFresh(january)).willReturn(DataSource.CACHE);
        stubFacility(null);

        FacilityAvailabilityResponse response =
                serviceAt("2026-01-15T03:00:00Z").getAvailability(FACILITY_ID, january);

        assertThat(response.bookableUntil()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(response.bookableFrom()).isEqualTo(LocalDate.of(2026, 3, 1));
        assertThat(response.bookableFrom()).isAfter(response.bookableUntil()); // FE 의 "닫힘" 판정 조건
        assertThat(slotAt(response, LocalDate.of(2026, 1, 17), 9).status()).isEqualTo(SlotStatus.AVAILABLE);
    }

    @Test
    @DisplayName("크롤 스냅샷이 stale 이어도 신청 창은 시설 오픈일로만 결정된다")
    void staleCrawlDoesNotChangeWindow() {
        YearMonth january = YearMonth.of(2026, 1);
        given(facilityCrawlService.ensureFresh(january)).willReturn(DataSource.STALE_CACHE);
        stubFacility();

        FacilityAvailabilityResponse response =
                serviceAt("2026-01-15T03:00:00Z").getAvailability(FACILITY_ID, january);

        assertThat(response.stale()).isTrue();
        assertThat(response.bookableFrom()).isEqualTo(LocalDate.of(2026, 1, 15));
        assertThat(response.bookableUntil()).isEqualTo(LocalDate.of(2026, 2, 28));
    }
}
