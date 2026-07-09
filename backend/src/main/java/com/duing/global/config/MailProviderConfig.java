package com.duing.global.config;

import com.duing.global.email.BrevoMailProvider;
import com.duing.global.email.BrevoProperties;
import com.duing.global.email.EmailSender;
import com.duing.global.email.FallbackEmailSender;
import com.duing.global.email.MailProvider;
import com.duing.global.email.ResendMailProvider;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 실발송 메일 Provider 체인 설정 — {@code email.provider=resend} 일 때만 활성.
 *
 * <p>체인 순서를 여기서 명시적으로 고정한다: Resend(주) → Brevo SMTP(폴백).
 * 폴백은 재시도 가능한 실패(429/5xx/타임아웃/네트워크)에서만 일어난다 —
 * {@link FallbackEmailSender} 참조. 새 Provider(SES·Mailgun 등)는 {@link MailProvider}
 * 구현체를 추가하고 이 목록에 순서대로 끼워 넣기만 하면 된다.
 *
 * <p>{@link BrevoProperties} 는 여기서만 등록되어 provider 가 resend 가 아닐 때는
 * 빈 검증이 돌지 않는다 ({@link ResendClientConfig} 의 ResendProperties 와 동일한 방식).
 */
@Configuration
@ConditionalOnProperty(name = "email.provider", havingValue = "resend")
@EnableConfigurationProperties(BrevoProperties.class)
public class MailProviderConfig {

    @Bean
    public EmailSender fallbackEmailSender(
            ResendMailProvider resendMailProvider,
            BrevoMailProvider brevoMailProvider) {
        return new FallbackEmailSender(List.of(resendMailProvider, brevoMailProvider));
    }
}
