package com.duing.domain.facilitybooking.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 예약 오픈 구간 정책 설정(설계 §1.5). mode 로 정책 전략을, pivot-day 로 반월 기준일을 바꾼다 —
 * "10일 기준" 같은 운영 요구는 설정만으로 대응한다. MONTHLY·FREE 는 키만 예약(선택 시 부팅 실패).
 */
@Validated
@ConfigurationProperties(prefix = "duing.facility.booking.window")
public record BookingWindowProperties(
        @NotNull BookingWindowMode mode,
        @Min(1) @Max(27) int pivotDay
) {

    public enum BookingWindowMode { HALF_MONTH, MONTHLY, FREE }
}
