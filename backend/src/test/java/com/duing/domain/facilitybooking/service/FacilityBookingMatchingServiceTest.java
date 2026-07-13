package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityBookingMatchingServiceTest {

    // decide(...) 는 순수 판정(DB·Clock 미접근)이라 자동 확정용 의존(리포지토리·Clock)은 null 로 조립한다.
    private final FacilityBookingMatchingService matchingService =
            new FacilityBookingMatchingService(new FacilityAvailabilityPolicy(), new OrganizationNameNormalizer(),
                    null, null, null);

    private static final LocalDate DATE = LocalDate.of(2026, 1, 20);

    private FacilityBooking approvedBooking(int startHour, int endHour) {
        FacilityBooking booking = FacilityBooking.request(1L, 2L, 3L, DATE,
                LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null);
        booking.approve(9L, null, LocalDateTime.of(2026, 1, 20, 9, 0));
        return booking;
    }

    private FacilityReservation occupiedRow(long scheduleSeq, int startHour, String organization) {
        return FacilityReservation.create(1L, scheduleSeq, YearMonth.from(DATE), DATE,
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0), organization,
                null, null, LocalDateTime.of(2026, 1, 20, 8, 0));
    }

    @Test
    @DisplayName("모든 서브슬롯이 같은 정규화 이름의 점유행으로 덮이면 CONFIRMED 판정이다")
    void confirmsWhenFullyCoveredByMatchingRows() {
        FacilityBooking booking = approvedBooking(18, 20);
        List<FacilityReservation> rows = List.of(
                occupiedRow(101L, 18, "밴드 부"), occupiedRow(102L, 19, "밴드부"));

        var decision = matchingService.decide(booking, "밴드부", rows);

        assertThat(decision.confirmed()).isTrue();
        assertThat(decision.matchedScheduleSeq()).isEqualTo(101L);
    }

    @Test
    @DisplayName("이름 불일치·부분 커버·운영행 커버는 CONFIRMED 판정이 아니다")
    void staysWhenNameMismatchOrPartialCoverage() {
        FacilityBooking booking = approvedBooking(18, 20);

        assertThat(matchingService.decide(booking, "밴드부",
                List.of(occupiedRow(101L, 18, "문화팀"), occupiedRow(102L, 19, "문화팀"))).confirmed()).isFalse();
        assertThat(matchingService.decide(booking, "밴드부",
                List.of(occupiedRow(101L, 18, "밴드부"))).confirmed()).isFalse(); // 19~20 미커버
        // 운영행(꼬리 있음)은 커버로 인정하지 않는다
        FacilityReservation operating = FacilityReservation.create(1L, 103L, YearMonth.from(DATE), DATE,
                LocalTime.of(18, 0), LocalTime.of(19, 0), "밴드부",
                LocalTime.of(9, 0), LocalTime.of(20, 0), LocalDateTime.of(2026, 1, 20, 8, 0));
        assertThat(matchingService.decide(booking, "밴드부",
                List.of(operating, occupiedRow(102L, 19, "밴드부"))).confirmed()).isFalse();
    }

    @Test
    @DisplayName("비정렬 점유행(18:30~19:30)은 겹쳐도 커버가 아니다 — 부분 반영은 자동 확정하지 않는다")
    void nonAlignedRowDoesNotCover() {
        FacilityBooking booking = approvedBooking(18, 20);
        FacilityReservation nonAligned = FacilityReservation.create(1L, 104L, YearMonth.from(DATE), DATE,
                LocalTime.of(18, 30), LocalTime.of(19, 30), "밴드부",
                null, null, LocalDateTime.of(2026, 1, 20, 8, 0));

        assertThat(matchingService.decide(booking, "밴드부", List.of(nonAligned)).confirmed()).isFalse();
    }
}
