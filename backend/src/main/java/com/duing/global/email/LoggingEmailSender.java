package com.duing.global.email;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 로컬 개발용 EmailSender — 실제 발송 없이 본문을 로그로 출력한다.
 *
 * <p>{@code email.provider} 미설정 또는 {@code logging} 일 때 활성 (matchIfMissing).
 * 운영은 {@code EMAIL_PROVIDER=resend} 로 {@link FallbackEmailSender}(Resend 주 + Brevo 폴백)가
 * 대신 등록된다.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "email.provider", havingValue = "logging", matchIfMissing = true)
public class LoggingEmailSender implements EmailSender {

    @Override
    public void send(EmailMessage emailMessage) {
        log.info("[LoggingEmailSender] to={}, subject={}\n{}",
                emailMessage.to(), emailMessage.subject(), emailMessage.html());
    }
}
