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
    @DisplayName("점유행은 겹치는 슬롯만 BLOCKED(SCHOOL·단체명)로 만들고, 운영행은 어떤 슬롯도 막지 않는다")
    void occupiedBlocksButOperatingDoesNot() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<CrawlSlice> crawl = List.of(
                // 운영행: 고정관념(09:00~20:00) — 슬롯 마커가 시작·끝 2행으로 내려오는 상황(선행 스펙 §16.1)
                // → 같은 (단체, 운영시간)이므로 OperatingNote 는 dedupe 되어 1건이어야 한다
                new CrawlSlice(date, LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                        CrawlRowType.OPERATING, LocalTime.of(9, 0), LocalTime.of(20, 0)),
                new CrawlSlice(date, LocalTime.of(19, 0), LocalTime.of(20, 0), "고정관념",
                        CrawlRowType.OPERATING, LocalTime.of(9, 0), LocalTime.of(20, 0)),
                // 점유행: 비호응원단 17~18, 18~19
                new CrawlSlice(date, LocalTime.of(17, 0), LocalTime.of(18, 0), "비호응원단",
                        CrawlRowType.OCCUPIED, null, null),
                new CrawlSlice(date, LocalTime.of(18, 0), LocalTime.of(19, 0), "비호응원단",
                        CrawlRowType.OCCUPIED, null, null));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, List.of());
        DayAvailability target = day(days, 20);

        assertThat(slotStatus(target, 9)).isEqualTo(SlotStatus.AVAILABLE); // 운영행 마커는 차단 안 함
        assertThat(slotStatus(target, 17)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(slotStatus(target, 18)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(slotStatus(target, 19)).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(target.slots().get(17 - 9).blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        assertThat(target.slots().get(17 - 9).organization()).isEqualTo("비호응원단");
        assertThat(target.availableSlotCount()).isEqualTo(11);
        assertThat(target.operatingNotes()).singleElement().satisfies(note -> {
            assertThat(note.organization()).isEqualTo("고정관념");
            assertThat(note.start()).isEqualTo("09:00");
            assertThat(note.end()).isEqualTo("20:00");
        });
    }

    @Test
    @DisplayName("내부 APPROVED 는 BLOCKED(INTERNAL·동아리명 비노출), PENDING 은 PENDING_HOLD(동아리명 비노출)다")
    void internalBookingsBlockOrHold() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<BookingSlice> bookings = List.of(
                new BookingSlice(date, LocalTime.of(10, 0), LocalTime.of(12, 0), BookingStatus.APPROVED),
                new BookingSlice(date, LocalTime.of(20, 0), LocalTime.of(21, 0), BookingStatus.PENDING));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), bookings);
        DayAvailability target = day(days, 20);

        assertThat(slotStatus(target, 10)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(target.slots().get(10 - 9).blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        assertThat(target.slots().get(10 - 9).organization()).isNull(); // 내부 예약 동아리명 비노출(2026-07-13 사용자 결정)
        assertThat(slotStatus(target, 20)).isEqualTo(SlotStatus.PENDING_HOLD);
        assertThat(target.slots().get(20 - 9).organization()).isNull(); // 승인 대기 동아리명 비노출(설계 §3.1)
        // PENDING_HOLD 는 신청 가능 상태라 count 에 포함된다(설계 §3.2 FULL 판정 기준) —
        // BLOCKED 2칸(10~12)만 제외되어 11 이어야 한다. count 에서 홀드를 빼는 회귀를 고정.
        assertThat(target.availableSlotCount()).isEqualTo(11);
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
                "총학생회", CrawlRowType.OCCUPIED, null, null));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(date, LocalTime.of(14, 0), LocalTime.of(15, 0), BookingStatus.PENDING));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings);

        assertThat(slotStatus(day(days, 20), 14)).isEqualTo(SlotStatus.BLOCKED);
    }
}
