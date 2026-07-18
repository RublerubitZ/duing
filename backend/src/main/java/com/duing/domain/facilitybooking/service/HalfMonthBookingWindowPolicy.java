package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * 반월(半月) 롤링 오픈 정책 — 현재 진행 중인 반월(오늘 이후)과 다음 반월을 함께 연다.
 * 오늘이 1~pivotDay 일이면 현재 구간은 [오늘, 당월 pivotDay 일], 다음 구간은 [당월 pivotDay+1 일, 당월 말일].
 * 오늘이 pivotDay+1~말일이면 현재 구간은 [오늘, 당월 말일], 다음 구간은 [익월 1일, 익월 pivotDay 일].
 * 두 구간은 항상 연속이라 단일 창 [오늘, 다음 반월 말일]로도 성립한다.
 * pivotDay 는 1~27 로 제한해 2월을 포함한 모든 달에서 구간이 성립한다.
 */
public class HalfMonthBookingWindowPolicy implements BookingWindowPolicy {

    private final int pivotDay;

    public HalfMonthBookingWindowPolicy(int pivotDay) {
        if (pivotDay < 1 || pivotDay > 27) {
            throw new IllegalArgumentException("pivotDay 는 1~27 사이여야 합니다: " + pivotDay);
        }
        this.pivotDay = pivotDay;
    }

    @Override
    public BookingWindow windowFor(LocalDate today) {
        YearMonth currentMonth = YearMonth.from(today);
        if (today.getDayOfMonth() <= pivotDay) {
            return rolling(today, currentMonth.atDay(pivotDay),
                    currentMonth.atDay(pivotDay + 1), currentMonth.atEndOfMonth());
        }
        YearMonth nextMonth = currentMonth.plusMonths(1);
        return rolling(today, currentMonth.atEndOfMonth(),
                nextMonth.atDay(1), nextMonth.atDay(pivotDay));
    }

    private BookingWindow rolling(LocalDate today, LocalDate currentHalfEnd,
                                  LocalDate nextHalfStart, LocalDate nextHalfEnd) {
        return new BookingWindow(today, nextHalfEnd, List.of(
                new BookingWindow.OpenRange(today, currentHalfEnd, BookingWindow.OpenRangeKind.CURRENT),
                new BookingWindow.OpenRange(nextHalfStart, nextHalfEnd, BookingWindow.OpenRangeKind.NEXT)));
    }
}
