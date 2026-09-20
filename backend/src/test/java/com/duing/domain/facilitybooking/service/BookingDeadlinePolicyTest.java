package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingDeadlinePolicyTest {

    private final BookingDeadlinePolicy deadlinePolicy = new BookingDeadlinePolicy();

    // 사용일 D 의 마감 = D-1 12:01(KST) 미만까지 허용 — 분 단위 경계(12:00:59 허용, 12:01:00 거부)
    private static final LocalDate USE_DATE = LocalDate.of(2026, 7, 20);

    @Test
    @DisplayName("사용일 전날 12:00:59까지는 신청할 수 있다")
    void allowsUntilNoonOfPreviousDay() {
        assertThatCode(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 19, 11, 59, 0))).doesNotThrowAnyException();
        assertThatCode(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 19, 12, 0, 59))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("사용일 전날 12:01:00부터는 신청이 마감된다")
    void rejectsFromTwelveOhOne() {
        assertThatThrownBy(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 19, 12, 1, 0)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class)
                .hasMessage("시설 사용일 전날 12:00까지만 신청할 수 있어요.");
    }

    @Test
    @DisplayName("당일 사용 신청은 시각과 무관하게 항상 마감이다")
    void sameDayIsAlwaysPastDeadline() {
        assertThatThrownBy(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 20, 0, 0, 1)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("이틀 이상 남은 사용일은 언제든 신청할 수 있다")
    void twoDaysAheadIsAlwaysOpen() {
        assertThatCode(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 18, 23, 59, 59))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("마감 예외는 FACILITY_BOOKING_DEADLINE_PASSED 코드를 갖는다")
    void deadlineExceptionCarriesCode() {
        assertThatThrownBy(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 20, 10, 0)))
                .isInstanceOfSatisfying(FacilityBookingException.DeadlinePassedException.class,
                        exception -> org.assertj.core.api.Assertions.assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_DEADLINE_PASSED"));
    }

    @Test
    @DisplayName("isPassed — 전날 12:00:59 까지 false, 12:01:00 부터 true, 당일은 항상 true, 이틀 전은 false")
    void isPassedSharesTheSameBoundaryAsValidate() {
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 19, 11, 59, 0))).isFalse();
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 19, 12, 0, 59))).isFalse();
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 19, 12, 1, 0))).isTrue();
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 20, 0, 0, 1))).isTrue();
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 18, 23, 59, 59))).isFalse();
    }
}
