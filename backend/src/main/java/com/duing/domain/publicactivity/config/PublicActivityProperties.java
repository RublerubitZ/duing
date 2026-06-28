package com.duing.domain.publicactivity.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "duing.public-activity")
public record PublicActivityProperties(
        @Positive @Max(365) int windowDays,
        @Positive @Max(100) int defaultLimit,
        @Positive @Max(100) int maxLimit
) {
    @AssertTrue(message = "duing.public-activity.default-limit 은 max-limit 을 초과할 수 없습니다")
    public boolean isDefaultWithinMax() {
        return defaultLimit <= maxLimit;
    }
}
