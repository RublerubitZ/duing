package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayStatus;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.OperatingNote;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotBlockSource;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.BookingSlice;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.CrawlSlice;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilitySlotAssemblerTest {

    private static final YearMonth MONTH = YearMonth.of(2026, 1);
    private static final LocalDate TODAY = LocalDate.of(2026, 1, 15);
    private static final LocalTime NOW = LocalTime.of(12, 30);

    private DayAvailability day(List<DayAvailability> days, int dayOfMonth) {
        return days.get(dayOfMonth - 1);
    }

    private SlotStatus slotStatus(DayAvailability day, int startHour) {
        return day.slots().get(startHour - 9).status();
    }

    @Test
    @DisplayName("크롤 행이 없는 미래 날짜는 13개 슬롯 전부 AVAILABLE 이고 dayStatus=AVAILABLE 이다")
    void emptyFutureDayIsFullyAvailable() {
        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(
                MONTH, TODAY, NOW, List.of(), List.of());

        DayAvailability future = day(days, 20);
        assertThat(future.slots()).hasSize(13);
        assertThat(future.availableSlotCount()).isEqualTo(13);
        assertThat(future.dayStatus()).isEqualTo(DayStatus.AVAILABLE);
        assertThat(future.slots()).allSatisfy(slot -> assertThat(slot.status()).isEqualTo(SlotStatus.AVAILABLE));
    }

    @Test
    @DisplayName("기본 확보 시간 분류 슬라이스는 차단하지 않고(AVAILABLE), 실예약 분류만 겹치는 슬롯을 차단한다")
    void basicSecuredSlicesDoNotBlock() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<CrawlSlice> crawl = List.of(
                // 기본 확보 시간 대상 동아리의 확장 행: 고정관념 [10:00, 17:00) — 비차단(2026-08-27 전환)
                new CrawlSlice(date, LocalTime.of(10, 0), LocalTime.of(17, 0), "고정관념",
                        CrawlRowType.BASIC_SECURED_TIME),
                // 실예약(미매칭 단체): 비호응원단 17~18, 18~19 — 지금처럼 차단
                new CrawlSlice(date, LocalTime.of(17, 0), LocalTime.of(18, 0), "비호응원단",
                        CrawlRowType.CRAWLED_RESERVATION),
                new CrawlSlice(date, LocalTime.of(18, 0), LocalTime.of(19, 0), "비호응원단",
                        CrawlRowType.CRAWLED_RESERVATION));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, List.of());
        DayAvailability target = day(days, 20);

        // 확보 구간 [10, 17) 전 구간 AVAILABLE — 다른 동아리가 그 시간대를 신청할 수 있다.
        for (int hour = 10; hour < 17; hour++) {
            assertThat(slotStatus(target, hour)).isEqualTo(SlotStatus.AVAILABLE);
            assertThat(target.slots().get(hour - 9).blockedBy()).isNull();
            assertThat(target.slots().get(hour - 9).organization()).isNull();
        }
        assertThat(slotStatus(target, 17)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(target.slots().get(17 - 9).blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        assertThat(target.slots().get(17 - 9).organization()).isEqualTo("비호응원단");
        assertThat(slotStatus(target, 18)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(target.availableSlotCount()).isEqualTo(11); // 실예약 2칸(17~19)만 차단
        // 확보 슬라이스는 표시 전용 operatingNotes 로 내려간다 — 차단 아님(v2 스펙 §3). 실예약 행은 미포함.
        assertThat(target.operatingNotes()).containsExactly(new OperatingNote("고정관념", "10:00", "17:00"));
    }

    @Test
    @DisplayName("확보 슬라이스가 있는 날은 operatingNotes 에 (단체, 시작, 끝)이 중복 없이 담기고, 없는 날은 빈 배열이다")
    void operatingNotesDedupeSecuredSlicesPerDay() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<CrawlSlice> crawl = List.of(
                new CrawlSlice(date, LocalTime.of(10, 0), LocalTime.of(13, 0), "고정관념",
                        CrawlRowType.BASIC_SECURED_TIME),
                // 같은 단체·같은 구간의 중복 행 — 행 단위 distinct 로 한 건만 남긴다.
                new CrawlSlice(date, LocalTime.of(10, 0), LocalTime.of(13, 0), "고정관념",
                        CrawlRowType.BASIC_SECURED_TIME),
                // 같은 단체의 인접 구간 — 병합하지 않고 별도 노트로 나열한다(행 단위 distinct).
                new CrawlSlice(date, LocalTime.of(13, 0), LocalTime.of(15, 0), "고정관념",
                        CrawlRowType.BASIC_SECURED_TIME),
                // 실예약 분류는 표시 데이터 소스가 아니다.
                new CrawlSlice(date, LocalTime.of(17, 0), LocalTime.of(18, 0), "비호응원단",
                        CrawlRowType.CRAWLED_RESERVATION));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, List.of());

        assertThat(day(days, 20).operatingNotes()).containsExactly(
                new OperatingNote("고정관념", "10:00", "13:00"),
                new OperatingNote("고정관념", "13:00", "15:00"));
        assertThat(day(days, 21).operatingNotes()).isEmpty(); // 확보 슬라이스가 없는 날은 빈 배열
    }

    @Test
    @DisplayName("확보 구간 안에 실예약이 공존하면 그 슬롯만 SCHOOL 로 차단되고 나머지 확보 구간은 AVAILABLE 이다")
    void crawledReservationStillBlocksInsideSecuredRange() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<CrawlSlice> crawl = List.of(
                new CrawlSlice(date, LocalTime.of(9, 0), LocalTime.of(20, 0), "고정관념",
                        CrawlRowType.BASIC_SECURED_TIME),
                new CrawlSlice(date, LocalTime.of(14, 0), LocalTime.of(15, 0), "학생생활상담센터",
                        CrawlRowType.CRAWLED_RESERVATION));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, List.of());
        DayAvailability target = day(days, 20);

        assertThat(slotStatus(target, 14)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(target.slots().get(14 - 9).blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        assertThat(target.slots().get(14 - 9).organization()).isEqualTo("학생생활상담센터");
        assertThat(slotStatus(target, 13)).isEqualTo(SlotStatus.AVAILABLE); // 확보 구간은 더 이상 차단 아님
        assertThat(target.availableSlotCount()).isEqualTo(12); // 실예약 1칸(14~15)만 차단
    }

    @Test
    @DisplayName("확보 구간에 내부 PENDING 신청이 겹치면 PENDING_HOLD 로 내려간다 — 동아리명 비노출 유지")
    void pendingHoldFallsThroughInsideSecuredRange() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<CrawlSlice> crawl = List.of(
                new CrawlSlice(date, LocalTime.of(9, 0), LocalTime.of(22, 0), "고정관념",
                        CrawlRowType.BASIC_SECURED_TIME));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(date, LocalTime.of(14, 0), LocalTime.of(15, 0), BookingStatus.PENDING, null));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings);
        DayAvailability target = day(days, 20);

        assertThat(slotStatus(target, 14)).isEqualTo(SlotStatus.PENDING_HOLD);
        assertThat(target.slots().get(14 - 9).organization()).isNull(); // 승인 대기 동아리명 비노출(설계 §3.1)
        assertThat(target.availableSlotCount()).isEqualTo(13); // PENDING_HOLD 도 신청 가능 count 포함
    }

    @Test
    @DisplayName("내부 APPROVED 는 BLOCKED(INTERNAL·동아리명 노출), PENDING 은 PENDING_HOLD(동아리명 비노출)다")
    void internalBookingsBlockOrHold() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<BookingSlice> bookings = List.of(
                new BookingSlice(date, LocalTime.of(10, 0), LocalTime.of(12, 0), BookingStatus.APPROVED, "재즈동아리"),
                // PENDING 슬라이스는 이름을 넣어도 어셈블러가 항상 숨겨야 한다(신청 경쟁 정보 비노출 회귀 고정).
                new BookingSlice(date, LocalTime.of(20, 0), LocalTime.of(21, 0), BookingStatus.PENDING, "숨겨야할동아리"));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), bookings);
        DayAvailability target = day(days, 20);

        assertThat(slotStatus(target, 10)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(target.slots().get(10 - 9).blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        // 승인 완료 예약은 학교 반영 후 크롤 SCHOOL 행으로 어차피 실명 공개되므로 동아리명을 노출한다
        // (2026-07-17 사용자 결정 §4⁗.1 — 구 비노출 정책 부분 반전).
        assertThat(target.slots().get(10 - 9).organization()).isEqualTo("재즈동아리");
        assertThat(target.slots().get(11 - 9).organization()).isEqualTo("재즈동아리"); // 겹치는 두 번째 칸도 노출
        assertThat(slotStatus(target, 20)).isEqualTo(SlotStatus.PENDING_HOLD);
        assertThat(target.slots().get(20 - 9).organization()).isNull(); // 승인 대기 동아리명 비노출(설계 §3.1, 신청 경쟁 정보)
        // PENDING_HOLD 는 신청 가능 상태라 count 에 포함된다(설계 §3.2 FULL 판정 기준) —
        // BLOCKED 2칸(10~12)만 제외되어 11 이어야 한다. count 에서 홀드를 빼는 회귀를 고정.
        assertThat(target.availableSlotCount()).isEqualTo(11);
    }

    @Test
    @DisplayName("BLOCKED(INTERNAL) 이라도 동아리명(organization)이 null 이면 그대로 null 로 내려간다(soft-delete 방어)")
    void internalBlockKeepsNullOrganizationWhenClubNameMissing() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        // 서비스가 soft-delete 된 동아리 이름을 못 찾아 null 을 주입한 경우 — 어셈블러는 방어적으로 null 유지.
        List<BookingSlice> bookings = List.of(
                new BookingSlice(date, LocalTime.of(13, 0), LocalTime.of(14, 0), BookingStatus.CONFIRMED, null));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), bookings);
        DayAvailability target = day(days, 20);

        assertThat(slotStatus(target, 13)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(target.slots().get(13 - 9).blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        assertThat(target.slots().get(13 - 9).organization()).isNull();
    }

    @Test
    @DisplayName("지난 날짜는 dayStatus=PAST, 오늘은 end≤now 슬롯이 PAST 이고 남은 슬롯은 당일 마감이라 DEADLINE_PASSED 다 (now=12:30)")
    void pastDatesAndSlots() {
        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), List.of());

        assertThat(day(days, 10).dayStatus()).isEqualTo(DayStatus.PAST);
        DayAvailability today = day(days, 15);
        assertThat(slotStatus(today, 9)).isEqualTo(SlotStatus.PAST);
        assertThat(slotStatus(today, 11)).isEqualTo(SlotStatus.PAST);   // 11~12, end 12:00 ≤ 12:30
        // 12~13 은 아직 지나지 않았지만 당일 사용 신청은 정의상 항상 마감(BookingDeadlinePolicy) → DEADLINE_PASSED
        assertThat(slotStatus(today, 12)).isEqualTo(SlotStatus.DEADLINE_PASSED);
        assertThat(today.availableSlotCount()).isZero();
        assertThat(today.dayStatus()).isEqualTo(DayStatus.FULL);
    }

    @Test
    @DisplayName("마감된 익일(전날 12:01 경과): 빈 슬롯만 DEADLINE_PASSED, 점유(SCHOOL·INTERNAL)·대기 슬롯은 상태를 유지하고 availableSlotCount=0·FULL 이다")
    void deadlinePassedDayKeepsOccupancyAndMarksEmptySlots() {
        LocalDate tomorrow = LocalDate.of(2026, 1, 16); // 오늘 1/15 12:30 → 1/16 은 마감(12:01 경과)
        List<CrawlSlice> crawl = List.of(new CrawlSlice(tomorrow, LocalTime.of(10, 0), LocalTime.of(11, 0),
                "총학생회", CrawlRowType.CRAWLED_RESERVATION));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(tomorrow, LocalTime.of(14, 0), LocalTime.of(15, 0), BookingStatus.APPROVED, "두잉밴드"),
                new BookingSlice(tomorrow, LocalTime.of(16, 0), LocalTime.of(17, 0), BookingStatus.PENDING, null));

        DayAvailability day = day(FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings), 16);

        assertThat(slotStatus(day, 9)).isEqualTo(SlotStatus.DEADLINE_PASSED);
        SlotAvailability school = day.slots().get(10 - 9);
        assertThat(school.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(school.blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        assertThat(school.organization()).isEqualTo("총학생회");
        SlotAvailability internal = day.slots().get(14 - 9);
        assertThat(internal.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(internal.blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        assertThat(internal.organization()).isEqualTo("두잉밴드");
        assertThat(slotStatus(day, 16)).isEqualTo(SlotStatus.PENDING_HOLD); // 대기 예약은 DEADLINE_PASSED 로 덮지 않는다
        assertThat(slotStatus(day, 21)).isEqualTo(SlotStatus.DEADLINE_PASSED);
        // 마감된 날의 대기 슬롯은 새 신청 대상이 아니라 세지 않는다 → 0 → FULL
        assertThat(day.availableSlotCount()).isZero();
        assertThat(day.dayStatus()).isEqualTo(DayStatus.FULL);
    }

    @Test
    @DisplayName("마감 경계(전날 12:00 KST 벽시계): now=12:00 이면 익일 빈 슬롯 AVAILABLE, now=12:01 이면 DEADLINE_PASSED, 이틀 뒤는 12:01 에도 AVAILABLE")
    void deadlineBoundaryAtNoonOfPreviousDay() {
        List<DayAvailability> atNoon = FacilitySlotAssembler.assembleDays(
                MONTH, TODAY, LocalTime.of(12, 0), List.of(), List.of());
        assertThat(slotStatus(day(atNoon, 16), 9)).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(day(atNoon, 16).availableSlotCount()).isEqualTo(13);

        List<DayAvailability> afterNoon = FacilitySlotAssembler.assembleDays(
                MONTH, TODAY, LocalTime.of(12, 1), List.of(), List.of());
        assertThat(slotStatus(day(afterNoon, 16), 9)).isEqualTo(SlotStatus.DEADLINE_PASSED);
        assertThat(day(afterNoon, 16).availableSlotCount()).isZero();
        assertThat(slotStatus(day(afterNoon, 17), 9)).isEqualTo(SlotStatus.AVAILABLE);
    }

    @Test
    @DisplayName("지난 날짜(직전 월 기록 열람): 점유 슬롯은 BLOCKED 를 보존하고 빈 슬롯·대기 슬롯은 PAST 다(DEADLINE_PASSED 아님)")
    void pastDayPreservesOccupancyAndUsesPastForEmptySlots() {
        LocalDate pastDate = LocalDate.of(2026, 1, 10);
        List<CrawlSlice> crawl = List.of(new CrawlSlice(pastDate, LocalTime.of(10, 0), LocalTime.of(12, 0),
                "비호응원단", CrawlRowType.CRAWLED_RESERVATION));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(pastDate, LocalTime.of(14, 0), LocalTime.of(15, 0), BookingStatus.CONFIRMED, "두잉밴드"),
                new BookingSlice(pastDate, LocalTime.of(17, 0), LocalTime.of(18, 0), BookingStatus.PENDING, null));

        DayAvailability day = day(FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings), 10);

        for (int hour : new int[] {10, 11}) {
            SlotAvailability slot = day.slots().get(hour - 9);
            assertThat(slot.status()).isEqualTo(SlotStatus.BLOCKED);
            assertThat(slot.blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
            assertThat(slot.organization()).isEqualTo("비호응원단");
        }
        SlotAvailability internal = day.slots().get(14 - 9);
        assertThat(internal.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(internal.blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        assertThat(internal.organization()).isEqualTo("두잉밴드");
        assertThat(slotStatus(day, 9)).isEqualTo(SlotStatus.PAST);
        assertThat(slotStatus(day, 17)).isEqualTo(SlotStatus.PAST); // 지난 시간대의 대기 신청은 홀드 의미가 없다(기존 동작)
        assertThat(slotStatus(day, 21)).isEqualTo(SlotStatus.PAST);
        assertThat(day.dayStatus()).isEqualTo(DayStatus.PAST);
        assertThat(day.availableSlotCount()).isZero();
    }

    @Test
    @DisplayName("오늘: 지난 시간대의 점유 슬롯은 BLOCKED 를 보존하고, 지난 빈 슬롯은 PAST, 남은 빈 슬롯은 DEADLINE_PASSED 다")
    void todayElapsedOccupiedSlotStaysBlocked() {
        List<CrawlSlice> crawl = List.of(new CrawlSlice(TODAY, LocalTime.of(9, 0), LocalTime.of(10, 0),
                "총학생회", CrawlRowType.CRAWLED_RESERVATION));

        DayAvailability today = day(FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, List.of()), 15);

        SlotAvailability elapsedOccupied = today.slots().get(0);
        assertThat(elapsedOccupied.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(elapsedOccupied.organization()).isEqualTo("총학생회");
        assertThat(slotStatus(today, 10)).isEqualTo(SlotStatus.PAST);
        assertThat(slotStatus(today, 13)).isEqualTo(SlotStatus.DEADLINE_PASSED);
    }

    @Test
    @DisplayName("우선순위: 같은 슬롯에 점유행과 PENDING 이 겹치면 BLOCKED 가 이긴다")
    void blockedWinsOverPendingHold() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<CrawlSlice> crawl = List.of(new CrawlSlice(date, LocalTime.of(14, 0), LocalTime.of(15, 0),
                "총학생회", CrawlRowType.CRAWLED_RESERVATION));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(date, LocalTime.of(14, 0), LocalTime.of(15, 0), BookingStatus.PENDING, null));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings);

        assertThat(slotStatus(day(days, 20), 14)).isEqualTo(SlotStatus.BLOCKED);
    }

    @Test
    @DisplayName("applicationClosed — 오늘·마감된 익일은 true, 이틀 뒤와 지난 날짜는 false, 경계는 전날 12:00/12:01")
    void applicationClosedFlagFollowsDeadlineForTodayAndFuture() {
        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), List.of());
        assertThat(day(days, 15).applicationClosed()).isTrue();  // 오늘 — 당일 신청은 항상 마감
        assertThat(day(days, 16).applicationClosed()).isTrue();  // 익일 — 12:30 > 12:00 경과
        assertThat(day(days, 17).applicationClosed()).isFalse(); // 이틀 뒤
        assertThat(day(days, 10).applicationClosed()).isFalse(); // 지난 날짜는 열람 전용 — 마감 안내 대상 아님

        List<DayAvailability> atNoon = FacilitySlotAssembler.assembleDays(MONTH, TODAY, LocalTime.of(12, 0), List.of(), List.of());
        assertThat(day(atNoon, 16).applicationClosed()).isFalse();
        List<DayAvailability> afterNoon = FacilitySlotAssembler.assembleDays(MONTH, TODAY, LocalTime.of(12, 1), List.of(), List.of());
        assertThat(day(afterNoon, 16).applicationClosed()).isTrue();
    }

    @Test
    @DisplayName("applicationClosed 는 빈 슬롯이 하나도 없는(전부 점유·대기) 마감된 날에도 true 다 — FE 잔여 한계 해소 근거")
    void applicationClosedIsTrueEvenWhenNoEmptySlotRemains() {
        LocalDate tomorrow = LocalDate.of(2026, 1, 16);
        List<CrawlSlice> crawl = List.of(new CrawlSlice(tomorrow, LocalTime.of(9, 0), LocalTime.of(21, 0),
                "총학생회", CrawlRowType.CRAWLED_RESERVATION));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(tomorrow, LocalTime.of(21, 0), LocalTime.of(22, 0), BookingStatus.PENDING, null));

        DayAvailability day = day(FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings), 16);

        assertThat(day.slots()).noneMatch(slot -> slot.status() == SlotStatus.DEADLINE_PASSED);
        assertThat(slotStatus(day, 21)).isEqualTo(SlotStatus.PENDING_HOLD);
        assertThat(day.applicationClosed()).isTrue();
        assertThat(day.availableSlotCount()).isZero();
    }
}
