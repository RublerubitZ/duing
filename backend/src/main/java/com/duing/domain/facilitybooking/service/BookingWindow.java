package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;

/**
 * 예약 가능 구간 값 객체 — 경계 포함([from, until]). from > until 이면 빈 창(닫힘·오픈 전).
 * 닫힘은 closed(until) 로 만든다: from = until + 1 — 필드는 항상 채워진 채로 "포함 날짜 없음" 을 표현한다(FE 계약: 문자열 2개).
 */
public record BookingWindow(LocalDate from, LocalDate until) {

    public static BookingWindow closed(LocalDate until) {
        return new BookingWindow(until.plusDays(1), until);
    }

    public boolean contains(LocalDate date) {
        return !date.isBefore(from) && !date.isAfter(until);
    }

    public boolean isEmpty() {
        return from.isAfter(until);
    }
}
