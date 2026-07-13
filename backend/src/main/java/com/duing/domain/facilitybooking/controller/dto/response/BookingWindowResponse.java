package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.BookingWindow;
import java.time.LocalDate;

/** 현재 예약 오픈 구간(설계 §1.5) — 시설 카드 화면이 시설 선택 전에 구간을 표시하기 위한 전 시설 공통 값. */
public record BookingWindowResponse(LocalDate bookableFrom, LocalDate bookableUntil) {

    public static BookingWindowResponse from(BookingWindow window) {
        return new BookingWindowResponse(window.from(), window.until());
    }
}
