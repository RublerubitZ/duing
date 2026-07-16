package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingPolicyValidatorTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    // KST 2026-01-10 12:30 — 상반기(1~15일): 롤링 창 = 1/10(오늘) ~ 1/31
    private static final Clock FIRST_HALF = Clock.fixed(Instant.parse("2026-01-10T03:30:00Z"), SEOUL);
    // KST 2026-01-20 12:30 — 하반기(16~말일): 롤링 창 = 1/20(오늘) ~ 2/15
    private static final Clock SECOND_HALF = Clock.fixed(Instant.parse("2026-01-20T03:30:00Z"), SEOUL);

    private final BookingWindowPolicy policy = new HalfMonthBookingWindowPolicy(15);

    private BookingPolicyValidator validatorAt(Clock clock) {
        return new BookingPolicyValidator(clock, policy);
    }

    @Test
    @DisplayName("정시가 아니거나 09~22시 밖이거나 역방향인 슬롯은 거부된다")
    void rejectsInvalidGrid() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        LocalDate bookable = LocalDate.of(2026, 1, 20);
        assertThatThrownBy(() -> validator.validateSlotRange(bookable, LocalTime.of(10, 30), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(bookable, LocalTime.of(8, 0), LocalTime.of(10, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(bookable, LocalTime.of(21, 0), LocalTime.of(23, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(bookable, LocalTime.of(14, 0), LocalTime.of(13, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
    }

    @Test
    @DisplayName("상반기(10일)에는 오늘부터 당월 말일까지 신청할 수 있고 과거·익월은 거부된다")
    void firstHalfAllowsTodayThroughEndOfMonth() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        // 오늘(1/10)의 아직 지나지 않은 슬롯도 롤링 창에 포함된다
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 16), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 31), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 9), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 1), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("하반기(20일)에는 오늘부터 익월 상반기 말일(15일)까지 신청할 수 있고 과거·그 이후는 거부된다")
    void secondHalfAllowsTodayThroughNextMonthFirstHalf() {
        BookingPolicyValidator validator = validatorAt(SECOND_HALF);
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 20), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .doesNotThrowAnyException();
        // 당월 잔여(1/25)도 롤링 창에 포함된다 — 반월 잠금이었다면 거부됐을 날짜
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 25), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 1), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 15), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 19), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 16), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("당일이라도 첫 1시간이 아직 지나지 않은 슬롯은 신청할 수 있다")
    void sameDaySlotWithinFirstHourIsAllowed() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF); // now = 12:30
        // 12:00 시작 슬롯: 첫 1시간(~13:00)이 아직 지나지 않았다 → 통과
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(12, 0), LocalTime.of(14, 0)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("당일에 첫 1시간이 완전히 지난 슬롯은 창 안이어도 거부된다")
    void sameDaySlotPastFirstHourIsRejected() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF); // now = 12:30
        // 09:00 시작 슬롯: 첫 1시간(~10:00)이 이미 지났다 → 거부
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(9, 0), LocalTime.of(11, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("창 밖 거부 메시지에 현재 예약 가능한 구간이 담긴다")
    void rejectionMessageCarriesWindow() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF); // 창 = 1/10 ~ 1/31
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 1), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .hasMessageContaining("1월 10일")
                .hasMessageContaining("1월 31일");
    }

    @Test
    @DisplayName("동아리의 활성 신청이 상한에 도달하면 새 신청이 거부된다")
    void rejectsWhenActiveCapReached() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        assertThatCode(() -> validator.validateActiveCap(9)).doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateActiveCap(10))
                .isInstanceOf(FacilityBookingException.ActiveBookingLimitExceededException.class);
    }
}
