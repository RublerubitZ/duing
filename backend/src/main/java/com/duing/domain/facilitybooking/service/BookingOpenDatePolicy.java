package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * 시설별 예약 오픈일 정책 — 신청 창 = [max(오픈일, 오늘), 익월 말일]. 오픈일 NULL = 닫힘(빈 창).
 * 상한이 익월 말일인 이유: 크롤 수집 범위(당월+익월)·가용성 열람 범위·FE 열람 월과 같은 축을 유지하기 위해서다.
 * 순수 판정 — Clock 은 호출부(BookingApplicationPolicy)가 보유한다.
 */
public class BookingOpenDatePolicy {

    public BookingWindow windowFor(LocalDate bookingOpenDate, LocalDate today) {
        LocalDate until = YearMonth.from(today).plusMonths(1).atEndOfMonth();
        if (bookingOpenDate == null) {
            return BookingWindow.closed(until);
        }
        LocalDate from = bookingOpenDate.isBefore(today) ? today : bookingOpenDate;
        return new BookingWindow(from, until);
    }

    /** 오픈일과 무관한 참조 창(오늘~익월 말일) — 폐기 예정 booking-window 엔드포인트가 구 FE 내비게이션용으로 쓴다. */
    public BookingWindow referenceWindow(LocalDate today) {
        return new BookingWindow(today, YearMonth.from(today).plusMonths(1).atEndOfMonth());
    }
}
