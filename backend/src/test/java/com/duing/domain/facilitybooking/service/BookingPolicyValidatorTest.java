package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingPolicyValidatorTest {

    // KST 2026-01-15 12:30 고정 — 테스트 날짜는 전부 이 시점 기준 상대값이라 만료되지 않는다.
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Clock FIXED = Clock.fixed(
            Instant.parse("2026-01-15T03:30:00Z"), SEOUL);

    private final BookingPolicyValidator validator = new BookingPolicyValidator(FIXED);

    private final LocalDate today = LocalDate.now(FIXED);

    @Test
    @DisplayName("정시가 아닌 시각·운영시간 밖·역전 범위는 InvalidSlotRange")
    void rejectsInvalidGrid() {
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(18, 30), LocalTime.of(20, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(8, 0), LocalTime.of(10, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(21, 0), LocalTime.of(23, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(20, 0), LocalTime.of(18, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
    }

    @Test
    @DisplayName("어제·다음 달 말일 이후는 OutOfBookingWindow")
    void rejectsOutOfWindowDates() {
        assertThatThrownBy(() -> validator.validateSlotRange(today.minusDays(1), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        LocalDate beyond = YearMonth.from(today).plusMonths(1).atEndOfMonth().plusDays(1);
        assertThatThrownBy(() -> validator.validateSlotRange(beyond, LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("오늘의 이미 끝난 슬롯은 거부하고, 진행 중·미래 슬롯은 허용한다 (now=12:30)")
    void todayPastSlotRejected() {
        assertThatThrownBy(() -> validator.validateSlotRange(today, LocalTime.of(10, 0), LocalTime.of(11, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        // 12~13 슬롯은 end(13:00) > now(12:30) 라 아직 유효(진행 중 슬롯)
        assertThatCode(() -> validator.validateSlotRange(today, LocalTime.of(12, 0), LocalTime.of(13, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(today, LocalTime.of(13, 0), LocalTime.of(15, 0)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("다음 달 말일까지는 허용한다")
    void allowsUpToEndOfNextMonth() {
        LocalDate lastBookable = YearMonth.from(today).plusMonths(1).atEndOfMonth();
        assertThatCode(() -> validator.validateSlotRange(lastBookable, LocalTime.of(9, 0), LocalTime.of(22, 0)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("활성 신청 10건 이상이면 ActiveBookingLimitExceeded")
    void rejectsWhenActiveCapReached() {
        assertThatCode(() -> validator.validateActiveCap(9)).doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateActiveCap(10))
                .isInstanceOf(FacilityBookingException.ActiveBookingLimitExceededException.class);
    }
}
