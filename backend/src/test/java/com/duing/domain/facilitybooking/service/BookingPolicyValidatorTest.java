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
    // KST 2026-01-10 12:30 — 당일 가드(시작 시각 경과) 판정 기준 시각
    private static final Clock FIRST_HALF = Clock.fixed(Instant.parse("2026-01-10T03:30:00Z"), SEOUL);
    // KST 2026-01-10 15:00:00 — 정각 경계
    private static final Clock ON_THE_HOUR = Clock.fixed(Instant.parse("2026-01-10T06:00:00Z"), SEOUL);

    private BookingPolicyValidator validatorAt(Clock clock) {
        return new BookingPolicyValidator(clock);
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
    @DisplayName("당일이라도 아직 시작하지 않은 슬롯은 신청할 수 있다")
    void sameDayUpcomingSlotIsAllowed() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF); // now = 12:30
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(13, 0), LocalTime.of(15, 0)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("당일에 진행 중이거나 이미 지난 슬롯은 지난 시간대로 거부된다")
    void sameDayStartedSlotIsRejected() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF); // now = 12:30
        // 12:00 시작 슬롯: 진행 중(12:00 ≤ 12:30 < 13:00) → 거부
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(12, 0), LocalTime.of(14, 0)))
                .isInstanceOf(FacilityBookingException.PastSlotException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(9, 0), LocalTime.of(11, 0)))
                .isInstanceOf(FacilityBookingException.PastSlotException.class);
    }

    @Test
    @DisplayName("지금이 정각이면 그 시각에 시작하는 슬롯도 지난 시간대이고, 다음 정각 슬롯은 신청할 수 있다")
    void slotStartingNowIsRejected() {
        BookingPolicyValidator validator = validatorAt(ON_THE_HOUR); // now = 15:00:00
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(15, 0), LocalTime.of(16, 0)))
                .isInstanceOf(FacilityBookingException.PastSlotException.class);
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(16, 0), LocalTime.of(17, 0)))
                .doesNotThrowAnyException();
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
