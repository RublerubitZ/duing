package com.duing.domain.facilitybooking.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.config.BookingWindowProperties.BookingWindowMode;
import com.duing.domain.facilitybooking.service.HalfMonthBookingWindowPolicy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingWindowConfigTest {

    private final BookingWindowConfig config = new BookingWindowConfig();

    @Test
    @DisplayName("HALF_MONTH 모드는 설정된 기준일로 반월 정책 빈을 만든다")
    void halfMonthModeCreatesPolicy() {
        var policy = config.bookingWindowPolicy(new BookingWindowProperties(BookingWindowMode.HALF_MONTH, 15));
        assertThat(policy).isInstanceOf(HalfMonthBookingWindowPolicy.class);
    }

    @Test
    @DisplayName("아직 구현되지 않은 모드(MONTHLY·FREE)를 선택하면 부팅 단계에서 명확히 실패한다")
    void unimplementedModesFailFast() {
        assertThatThrownBy(() -> config.bookingWindowPolicy(new BookingWindowProperties(BookingWindowMode.MONTHLY, 15)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MONTHLY");
        assertThatThrownBy(() -> config.bookingWindowPolicy(new BookingWindowProperties(BookingWindowMode.FREE, 15)))
                .isInstanceOf(IllegalStateException.class);
    }
}
