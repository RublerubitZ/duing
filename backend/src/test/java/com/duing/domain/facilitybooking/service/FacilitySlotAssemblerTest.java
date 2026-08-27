package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayStatus;
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
        // 비차단 운영행 개념 폐지 — operatingNotes 는 항상 빈 배열(구 FE 스큐 호환용 계약 유지).
        assertThat(target.operatingNotes()).isEmpty();
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
    @DisplayName("지난 날짜는 dayStatus=PAST, 오늘은 end≤now 슬롯만 PAST 다 (now=12:30 → 9~12시 PAST)")
    void pastDatesAndSlots() {
        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), List.of());

        assertThat(day(days, 10).dayStatus()).isEqualTo(DayStatus.PAST);
        DayAvailability today = day(days, 15);
        assertThat(slotStatus(today, 9)).isEqualTo(SlotStatus.PAST);
        assertThat(slotStatus(today, 11)).isEqualTo(SlotStatus.PAST);   // 11~12, end 12:00 ≤ 12:30
        assertThat(slotStatus(today, 12)).isEqualTo(SlotStatus.AVAILABLE); // 12~13, end 13:00 > 12:30
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
}
