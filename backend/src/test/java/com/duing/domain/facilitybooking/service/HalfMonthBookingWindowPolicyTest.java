package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.service.BookingWindow.OpenRange;
import com.duing.domain.facilitybooking.service.BookingWindow.OpenRangeKind;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class HalfMonthBookingWindowPolicyTest {

    private final HalfMonthBookingWindowPolicy policy = new HalfMonthBookingWindowPolicy(15);

    @Test
    @DisplayName("반월 시작일(1일)에는 현재 반월 전체와 다음 반월이 함께 열린다")
    void firstDayOpensCurrentAndNextHalf() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 1));

        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 1));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertCurrentRange(window, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 15));
        assertNextRange(window, LocalDate.of(2026, 7, 16), LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("반월 중간(10일)에는 현재 구간이 오늘부터 시작해 과거 날짜가 예약 가능으로 표기되지 않는다")
    void midHalfClipsCurrentRangeToToday() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 10));

        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 10));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertCurrentRange(window, LocalDate.of(2026, 7, 10), LocalDate.of(2026, 7, 15));
        assertNextRange(window, LocalDate.of(2026, 7, 16), LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("기준일 당일(15일)은 아직 상반기로 취급되어 현재 구간이 오늘 하루로 좁혀진다")
    void pivotDayItselfBelongsToFirstHalf() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 15));

        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 15));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertCurrentRange(window, LocalDate.of(2026, 7, 15), LocalDate.of(2026, 7, 15));
        assertNextRange(window, LocalDate.of(2026, 7, 16), LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("기준일 다음날(16일)에는 현재 반월(말일까지)과 다음 달 상반기가 함께 열린다")
    void afterPivotOpensRestOfMonthAndNextMonthFirstHalf() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 16));

        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 16));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 8, 15));
        assertCurrentRange(window, LocalDate.of(2026, 7, 16), LocalDate.of(2026, 7, 31));
        assertNextRange(window, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 15));
    }

    @Test
    @DisplayName("말일(31일)에는 현재 구간이 오늘 하루, 다음 달 상반기가 다음 구간이 된다")
    void endOfMonthOpensSingleDayCurrentAndNextMonthFirstHalf() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 31));

        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 8, 15));
        assertCurrentRange(window, LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31));
        assertNextRange(window, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 15));
    }

    @Test
    @DisplayName("2월 하반기(평년 20일)에는 현재 구간이 28일까지, 다음 구간이 3월 상반기가 된다")
    void februaryCommonYearHandlesShortMonth() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 2, 20));

        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 2, 20));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 3, 15));
        assertCurrentRange(window, LocalDate.of(2026, 2, 20), LocalDate.of(2026, 2, 28));
        assertNextRange(window, LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 15));
    }

    @Test
    @DisplayName("2월 하반기(윤년 20일)에는 현재 구간이 29일까지 열린다")
    void februaryLeapYearHandlesShortMonth() {
        BookingWindow window = policy.windowFor(LocalDate.of(2028, 2, 20));

        assertThat(window.from()).isEqualTo(LocalDate.of(2028, 2, 20));
        assertThat(window.until()).isEqualTo(LocalDate.of(2028, 3, 15));
        assertCurrentRange(window, LocalDate.of(2028, 2, 20), LocalDate.of(2028, 2, 29));
        assertNextRange(window, LocalDate.of(2028, 3, 1), LocalDate.of(2028, 3, 15));
    }

    @Test
    @DisplayName("기준일 상한(27일)에서도 평년 2월의 다음 구간이 하루(28일)로 성립한다")
    void maxPivotDayKeepsFebruaryNextRangeValid() {
        HalfMonthBookingWindowPolicy maxPivotPolicy = new HalfMonthBookingWindowPolicy(27);

        BookingWindow window = maxPivotPolicy.windowFor(LocalDate.of(2026, 2, 10));

        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertCurrentRange(window, LocalDate.of(2026, 2, 10), LocalDate.of(2026, 2, 27));
        assertNextRange(window, LocalDate.of(2026, 2, 28), LocalDate.of(2026, 2, 28));
    }

    @Test
    @DisplayName("12월 하반기에는 다음 구간이 다음 해 1월 상반기로 연 경계를 넘는다")
    void crossesYearBoundary() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 12, 20));

        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 12, 20));
        assertThat(window.until()).isEqualTo(LocalDate.of(2027, 1, 15));
        assertCurrentRange(window, LocalDate.of(2026, 12, 20), LocalDate.of(2026, 12, 31));
        assertNextRange(window, LocalDate.of(2027, 1, 1), LocalDate.of(2027, 1, 15));
    }

    @Test
    @DisplayName("현재 구간과 다음 구간은 항상 연속이고, 단일 창은 두 구간의 양 끝과 일치한다")
    void openRangesAreContinuousAndSpanTheSingleWindow() {
        for (LocalDate today : new LocalDate[] {
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 10), LocalDate.of(2026, 7, 15),
                LocalDate.of(2026, 7, 16), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 12, 20)}) {
            BookingWindow window = policy.windowFor(today);
            OpenRange current = window.openRanges().get(0);
            OpenRange next = window.openRanges().get(1);

            assertThat(current.until().plusDays(1)).isEqualTo(next.from());
            assertThat(window.from()).isEqualTo(current.from());
            assertThat(window.until()).isEqualTo(next.until());
        }
    }

    @Test
    @DisplayName("기준일을 바꾸면(예: 10일) 구간 경계가 함께 이동한다")
    void customPivotDayShiftsWindow() {
        HalfMonthBookingWindowPolicy tenDayPolicy = new HalfMonthBookingWindowPolicy(10);

        BookingWindow beforePivot = tenDayPolicy.windowFor(LocalDate.of(2026, 7, 5));
        assertThat(beforePivot.from()).isEqualTo(LocalDate.of(2026, 7, 5));
        assertThat(beforePivot.until()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertCurrentRange(beforePivot, LocalDate.of(2026, 7, 5), LocalDate.of(2026, 7, 10));
        assertNextRange(beforePivot, LocalDate.of(2026, 7, 11), LocalDate.of(2026, 7, 31));

        BookingWindow afterPivot = tenDayPolicy.windowFor(LocalDate.of(2026, 7, 11));
        assertThat(afterPivot.from()).isEqualTo(LocalDate.of(2026, 7, 11));
        assertThat(afterPivot.until()).isEqualTo(LocalDate.of(2026, 8, 10));
        assertCurrentRange(afterPivot, LocalDate.of(2026, 7, 11), LocalDate.of(2026, 7, 31));
        assertNextRange(afterPivot, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 10));
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
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 10)); // 7.10 ~ 7.31

        assertThat(window.contains(LocalDate.of(2026, 7, 10))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 7, 31))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 7, 9))).isFalse();
        assertThat(window.contains(LocalDate.of(2026, 8, 1))).isFalse();
    }

    private void assertCurrentRange(BookingWindow window, LocalDate from, LocalDate until) {
        OpenRange current = window.openRanges().get(0);
        assertThat(current.kind()).isEqualTo(OpenRangeKind.CURRENT);
        assertThat(current.from()).isEqualTo(from);
        assertThat(current.until()).isEqualTo(until);
    }

    private void assertNextRange(BookingWindow window, LocalDate from, LocalDate until) {
        OpenRange next = window.openRanges().get(1);
        assertThat(next.kind()).isEqualTo(OpenRangeKind.NEXT);
        assertThat(next.from()).isEqualTo(from);
        assertThat(next.until()).isEqualTo(until);
    }
}
