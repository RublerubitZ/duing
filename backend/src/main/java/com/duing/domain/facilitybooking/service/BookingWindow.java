package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;
import java.util.List;

/** 예약 가능 구간 값 객체 — 경계 포함([from, until]). openRanges 는 라벨링용 세부 구간(롤링: 현재+다음 반월). */
public record BookingWindow(LocalDate from, LocalDate until, List<OpenRange> openRanges) {

    public enum OpenRangeKind { CURRENT, NEXT }

    /** 세부 오픈 구간 — kind 는 응답 계층이 라벨로 매핑한다(도메인은 한글 문자열을 모른다). */
    public record OpenRange(LocalDate from, LocalDate until, OpenRangeKind kind) {}

    public boolean contains(LocalDate date) {
        return !date.isBefore(from) && !date.isAfter(until);
    }
}
