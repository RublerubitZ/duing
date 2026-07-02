package com.duing.domain.facility.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 학생회관 시설 크롤러 설정. baseUrl·경로·타임아웃·재시도·룸 간격을 담는다.
 * 재시도(retryMaxAttempts/retryBackoffMillis)는 {@code @Retryable} 의 maxAttemptsExpression/
 * delayExpression 이 이 프로퍼티 키를 SpEL 로 참조한다(§5.3: 총 4회 / 0.5·1·2초).
 */
@Validated
@ConfigurationProperties(prefix = "duing.facility.crawler")
public record FacilityCrawlerProperties(
        @NotBlank String baseUrl,
        @NotBlank String listPath,
        @NotBlank String dataPath,
        @NotBlank String userAgent,
        @Positive int connectTimeoutMillis,
        @Positive int readTimeoutMillis,
        @Positive int retryMaxAttempts,
        @Positive int retryBackoffMillis,
        @Positive int roomDelayMillis,
        boolean enabled
) {}
