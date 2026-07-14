package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * 반월(半月) 오픈 정책 — 항상 "다음 오픈 구간"만 신청 가능하다.
 * 오늘이 1~pivotDay 일이면 당월 (pivotDay+1)일~말일, (pivotDay+1)~말일이면 익월 1일~pivotDay 일.
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
            return new BookingWindow(currentMonth.atDay(pivotDay + 1), currentMonth.atEndOfMonth());
        }
        YearMonth nextMonth = currentMonth.plusMonths(1);
        return new BookingWindow(nextMonth.atDay(1), nextMonth.atDay(pivotDay));
    }
}
