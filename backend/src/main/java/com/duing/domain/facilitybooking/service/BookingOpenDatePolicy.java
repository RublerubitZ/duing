package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * 시설별 예약 오픈·마감일 정책 — 신청 창 = [max(오픈일, 오늘), min(마감일, 익월 말일)].
 * 오픈일 NULL = 닫힘(빈 창), 마감일 NULL = 상한 없음(익월 말일).
 * 상한이 익월 말일인 이유: 크롤 수집 범위(당월+익월)·가용성 열람 범위·FE 열람 월과 같은 축을 유지하기 위해서다.
 * 순수 판정 — Clock 은 호출부(BookingApplicationPolicy)가 보유한다.
 */
public class BookingOpenDatePolicy {

    public BookingWindow windowFor(LocalDate bookingOpenDate, LocalDate bookingCloseDate, LocalDate today) {
        LocalDate nextMonthEnd = YearMonth.from(today).plusMonths(1).atEndOfMonth();
        // 마감일 상한은 관리자 검증(익월 말일)이 막지만, 조회 시점 클램프를 방어선으로 둔다(크롤·열람 범위 불변).
        LocalDate until = (bookingCloseDate == null || bookingCloseDate.isAfter(nextMonthEnd)) ? nextMonthEnd : bookingCloseDate;
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
