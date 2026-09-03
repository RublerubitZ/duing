package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.BookingWindow;
import java.time.LocalDate;

/**
 * 전 시설 공통 참조 창(오늘~익월 말일).
 *
 * @deprecated 전 시설 공통 창은 시설별 오픈일 도입으로 의미를 잃었다. 구 FE 호환용 참조 창으로 한 릴리스 유지 후 삭제한다.
 */
@Deprecated
public record BookingWindowResponse(LocalDate bookableFrom, LocalDate bookableUntil) {

    public static BookingWindowResponse from(BookingWindow window) {
        return new BookingWindowResponse(window.from(), window.until());
    }
}
