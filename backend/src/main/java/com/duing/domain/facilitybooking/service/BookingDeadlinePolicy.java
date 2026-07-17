package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 신청 마감 정책 — 사용일 전날 12:00(KST)까지만 신청 가능. 분 단위 경계: 12:00:59 허용,
 * 12:01:00부터 거부(설계 spec 2026-07-18 §1). 당일 사용 신청은 정의상 항상 마감이다.
 * Clock 은 조합 진입점(BookingApplicationPolicy)이 보유하고 여기는 순수 판정만 한다.
 */
public class BookingDeadlinePolicy {

    private static final LocalTime CUTOFF_EXCLUSIVE = LocalTime.of(12, 1);

    public void validate(LocalDate reservationDate, LocalDateTime now) {
        LocalDateTime applicationDeadline = reservationDate.minusDays(1).atTime(CUTOFF_EXCLUSIVE);
        if (!now.isBefore(applicationDeadline)) {
            throw new FacilityBookingException.DeadlinePassedException();
        }
    }
}
