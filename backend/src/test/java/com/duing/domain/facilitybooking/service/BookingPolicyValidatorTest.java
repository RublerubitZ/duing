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
    // KST 2026-01-10 12:30 — 상반기(1~15일): 창 = 1/16 ~ 1/31
    private static final Clock FIRST_HALF = Clock.fixed(Instant.parse("2026-01-10T03:30:00Z"), SEOUL);
    // KST 2026-01-20 12:30 — 하반기(16~말일): 창 = 2/1 ~ 2/15
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
    @DisplayName("상반기에는 당월 하반기(16일~말일)만 신청할 수 있다 — 오늘·창 이전·익월은 거부된다")
    void firstHalfAllowsOnlySecondHalfOfMonth() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 16), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 31), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 15), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 1), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("하반기에는 익월 상반기(1일~15일)만 신청할 수 있다")
    void secondHalfAllowsOnlyFirstHalfOfNextMonth() {
        BookingPolicyValidator validator = validatorAt(SECOND_HALF);
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 1), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 15), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 25), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 16), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("창 밖 거부 메시지에 현재 예약 가능한 구간이 담긴다")
    void rejectionMessageCarriesWindow() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .hasMessageContaining("1월 16일")
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
