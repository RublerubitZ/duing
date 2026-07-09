package com.duing.global.email;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Brevo 발신자 표기 설정. SMTP 호스트·크레덴셜은 {@code spring.mail.*} 로 주입되므로
 * 여기에는 발신자({@code brevo.from})만 둔다. {@code email.provider=resend} 일 때만
 * {@link com.duing.global.config.MailProviderConfig} 가 등록해 빈 검증이 로컬을 죽이지 않는다.
 */
@Validated
@ConfigurationProperties(prefix = "brevo")
public record BrevoProperties(
        @NotBlank String from
) {}
