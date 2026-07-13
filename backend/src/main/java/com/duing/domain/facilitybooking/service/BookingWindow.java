package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;

/** 예약 가능 구간 값 객체 — 경계 포함([from, until]). */
public record BookingWindow(LocalDate from, LocalDate until) {

    public boolean contains(LocalDate date) {
        return !date.isBefore(from) && !date.isAfter(until);
    }
}
