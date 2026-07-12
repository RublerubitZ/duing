package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
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

    public BookingPolicyValidator(Clock clock) {
        this.clock = clock;
    }

    /** 슬롯 그리드(정시·09~22·정방향) + 신청 가능 기간(오늘~다음 달 말일, 지난 슬롯 제외) 검증. */
    public void validateSlotRange(LocalDate date, LocalTime startTime, LocalTime endTime) {
        if (startTime.getMinute() != 0 || endTime.getMinute() != 0
                || startTime.isBefore(OPEN_TIME) || endTime.isAfter(CLOSE_TIME)
                || !startTime.isBefore(endTime)) {
            throw new FacilityBookingException.InvalidSlotRangeException();
        }
        LocalDate today = LocalDate.now(clock);
        LocalDate lastBookableDate = YearMonth.now(clock).plusMonths(1).atEndOfMonth();
        if (date.isBefore(today) || date.isAfter(lastBookableDate)) {
            throw new FacilityBookingException.OutOfBookingWindowException();
        }
        // 오늘이면 이미 끝난 슬롯(PAST: end ≤ now)이 포함되면 안 된다 — 첫 슬롯의 end 가 미래여야 한다(설계 §3.1).
        if (date.isEqual(today) && !startTime.plusHours(1).isAfter(LocalTime.now(clock))) {
            throw new FacilityBookingException.OutOfBookingWindowException();
        }
    }

    public void validateActiveCap(long activeCount) {
        if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_CLUB) {
            throw new FacilityBookingException.ActiveBookingLimitExceededException(MAX_ACTIVE_BOOKINGS_PER_CLUB);
        }
    }
}
