package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.BookingWindow;
import java.time.LocalDate;

/** 전 시설 공통 참조 창(오늘~익월 말일) — 시설별 창은 가용성 응답의 bookableFrom/Until 이 내린다. */
public record BookingWindowResponse(LocalDate bookableFrom, LocalDate bookableUntil) {

    public static BookingWindowResponse from(BookingWindow window) {
        return new BookingWindowResponse(window.from(), window.until());
    }
}
