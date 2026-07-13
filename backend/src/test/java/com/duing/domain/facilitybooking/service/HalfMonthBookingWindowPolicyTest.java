package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class HalfMonthBookingWindowPolicyTest {

    private final HalfMonthBookingWindowPolicy policy = new HalfMonthBookingWindowPolicy(15);

    @Test
    @DisplayName("오늘이 1일~15일이면 당월 16일부터 말일까지가 예약 가능 구간이 된다")
    void firstHalfOpensSecondHalfOfThisMonth() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 10));
        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 16));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("기준일 당일(15일)은 아직 상반기로 취급되어 당월 하반기가 열린다")
    void pivotDayItselfBelongsToFirstHalf() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 15));
        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 16));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("오늘이 16일~말일이면 다음 달 1일부터 15일까지가 예약 가능 구간이 된다")
    void secondHalfOpensFirstHalfOfNextMonth() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 16));
        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 8, 15));

        BookingWindow endOfMonth = policy.windowFor(LocalDate.of(2026, 7, 31));
        assertThat(endOfMonth.from()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(endOfMonth.until()).isEqualTo(LocalDate.of(2026, 8, 15));
    }

    @Test
    @DisplayName("12월 하반기에는 다음 해 1월 상반기가 열린다 — 연 경계를 넘는다")
    void crossesYearBoundary() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 12, 20));
        assertThat(window.from()).isEqualTo(LocalDate.of(2027, 1, 1));
        assertThat(window.until()).isEqualTo(LocalDate.of(2027, 1, 15));
    }

    @Test
    @DisplayName("2월에도 안전하다 — 평년은 16~28일, 윤년은 16~29일이 열린다")
    void handlesFebruary() {
        assertThat(policy.windowFor(LocalDate.of(2026, 2, 10)).until()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(policy.windowFor(LocalDate.of(2028, 2, 10)).until()).isEqualTo(LocalDate.of(2028, 2, 29));
    }

    @Test
    @DisplayName("기준일을 바꾸면(예: 10일) 구간 경계가 함께 이동한다")
    void customPivotDayShiftsWindow() {
        HalfMonthBookingWindowPolicy tenDayPolicy = new HalfMonthBookingWindowPolicy(10);
        assertThat(tenDayPolicy.windowFor(LocalDate.of(2026, 7, 10)).from()).isEqualTo(LocalDate.of(2026, 7, 11));
        assertThat(tenDayPolicy.windowFor(LocalDate.of(2026, 7, 11)).from()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(tenDayPolicy.windowFor(LocalDate.of(2026, 7, 11)).until()).isEqualTo(LocalDate.of(2026, 8, 10));
    }

    @Test
    @DisplayName("기준일이 1~27 범위를 벗어나면 생성 시점에 거부된다")
    void rejectsInvalidPivotDay() {
        assertThatThrownBy(() -> new HalfMonthBookingWindowPolicy(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new HalfMonthBookingWindowPolicy(28)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("BookingWindow.contains 는 경계 포함으로 판정한다")
    void windowContainsIsInclusive() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 10)); // 7.16 ~ 7.31
        assertThat(window.contains(LocalDate.of(2026, 7, 16))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 7, 31))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 7, 15))).isFalse();
        assertThat(window.contains(LocalDate.of(2026, 8, 1))).isFalse();
    }
}
