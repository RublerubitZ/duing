package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Component;

/**
 * 신청 규칙 검증(설계 §3.3). P1 은 상수 정책 — P2 에서 시설별·동아리별 설정값(정책 테이블)으로
 * 교체할 때 이 컴포넌트 내부만 바뀌고 호출부는 유지된다.
 */
@Component
public class BookingPolicyValidator {

    public static final LocalTime OPEN_TIME = LocalTime.of(9, 0);
    public static final LocalTime CLOSE_TIME = LocalTime.of(22, 0);
    public static final int MAX_ACTIVE_BOOKINGS_PER_CLUB = 10;

    private final Clock clock;
    private final BookingWindowPolicy bookingWindowPolicy;

    public BookingPolicyValidator(Clock clock, BookingWindowPolicy bookingWindowPolicy) {
        this.clock = clock;
        this.bookingWindowPolicy = bookingWindowPolicy;
    }

    /** 슬롯 그리드(정시·09~22·정방향) + 예약 오픈 구간(BookingWindowPolicy, 지난 슬롯 제외) 검증. */
    public void validateSlotRange(LocalDate date, LocalTime startTime, LocalTime endTime) {
        if (!startTime.equals(startTime.truncatedTo(ChronoUnit.HOURS))
                || !endTime.equals(endTime.truncatedTo(ChronoUnit.HOURS))
                || startTime.isBefore(OPEN_TIME) || endTime.isAfter(CLOSE_TIME)
                || !startTime.isBefore(endTime)) {
            throw new FacilityBookingException.InvalidSlotRangeException();
        }
        LocalDateTime currentDateTime = LocalDateTime.now(clock);
        LocalDate today = currentDateTime.toLocalDate();
        BookingWindow window = bookingWindowPolicy.windowFor(today);
        if (!window.contains(date)) {
            throw new FacilityBookingException.OutOfBookingWindowException(window);
        }
        // 롤링 창은 오늘을 포함한다 — 당일 신청 중 첫 1시간이 완전히 지난 슬롯은 거부(어셈블러 PAST 판정과 동일 기준).
        if (date.isEqual(today) && !startTime.plusHours(1).isAfter(currentDateTime.toLocalTime())) {
            throw new FacilityBookingException.OutOfBookingWindowException(window);
        }
    }

    public void validateActiveCap(long activeCount) {
        if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_CLUB) {
            throw new FacilityBookingException.ActiveBookingLimitExceededException(MAX_ACTIVE_BOOKINGS_PER_CLUB);
        }
    }
}
