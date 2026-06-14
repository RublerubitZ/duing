package com.duing.global.privacy;

import jakarta.validation.constraints.NotNull;
import java.time.Period;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * PII 보관기간 파기 잡 설정.
 *
 * <p>{@code enabled} 기본 비활성 — 법무/내부 방침으로 {@code window}(보관기간)를 확정한 뒤 운영에서 켠다.
 * {@code window} 는 {@link Period}(예: {@code P1Y}, {@code P3Y})로 환경변수 주입하며, 코드에 보관기간을
 * 하드코딩하지 않는다.
 */
@Validated
@ConfigurationProperties(prefix = "duing.privacy.retention")
public record RetentionProperties(boolean enabled, @NotNull Period window) {
}
