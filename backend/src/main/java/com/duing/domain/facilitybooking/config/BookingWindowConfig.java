package com.duing.domain.facilitybooking.config;

import com.duing.domain.facilitybooking.service.BookingWindowPolicy;
import com.duing.domain.facilitybooking.service.HalfMonthBookingWindowPolicy;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(BookingWindowProperties.class)
public class BookingWindowConfig {

    @Bean
    public BookingWindowPolicy bookingWindowPolicy(BookingWindowProperties properties) {
        return switch (properties.mode()) {
            case HALF_MONTH -> new HalfMonthBookingWindowPolicy(properties.pivotDay());
            // 키만 예약된 모드 — 구현 전 선택은 설정 실수이므로 부팅 단계에서 명확히 실패시킨다.
            case MONTHLY, FREE -> throw new IllegalStateException(
                    "duing.facility.booking.window.mode=" + properties.mode() + " 는 아직 구현되지 않았습니다.");
        };
    }
}
