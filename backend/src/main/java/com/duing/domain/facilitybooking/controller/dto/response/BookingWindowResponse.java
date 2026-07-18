package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.BookingWindow;
import java.time.LocalDate;
import java.util.List;

/** 현재 예약 오픈 구간(설계 §1.5 → 2026-07-16 롤링 전환) — 단일 창(하위호환) + 라벨링된 세부 구간. */
public record BookingWindowResponse(LocalDate bookableFrom, LocalDate bookableUntil,
                                    List<BookingRangeResponse> availableBookingRanges) {

    public record BookingRangeResponse(LocalDate startDate, LocalDate endDate, String label) {}

    public static BookingWindowResponse from(BookingWindow window) {
        List<BookingRangeResponse> ranges = window.openRanges().stream()
                .map(range -> new BookingRangeResponse(range.from(), range.until(), labelOf(range.kind())))
                .toList();
        return new BookingWindowResponse(window.from(), window.until(), ranges);
    }

    private static String labelOf(BookingWindow.OpenRangeKind kind) {
        return switch (kind) {
            case CURRENT -> "현재 예약 가능";
            case NEXT -> "다음 예약 가능";
        };
    }
}
