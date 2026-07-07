package com.duing.domain.federation.job;

import jakarta.validation.constraints.NotNull;
import java.time.Period;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 총동연 1:1 문의 본문·첨부 파기 잡 설정 (PiiRetentionJob 의 {@code RetentionProperties} 전례).
 *
 * <p>{@code enabled} 기본 비활성 — 운영에서 켠다. {@code window} 는 보관기간({@link Period}, 기본
 * {@code P45D} — 개인정보 처리방침의 45일 보관과 동일한 window)이며 코드에 하드코딩하지 않고
 * 환경변수로 주입한다.
 */
@Validated
@ConfigurationProperties(prefix = "duing.federation-inquiry.purge")
public record FederationInquiryPurgeProperties(boolean enabled, @NotNull Period window) {
}
