package com.duing.common;

import com.duing.global.email.EmailMessage;
import com.duing.global.email.EmailSender;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * test 프로파일 전용 기록형 EmailSender — 마지막 발송 메시지를 보관한다.
 *
 * <p>{@code email.provider=stub} (test/application.yml 에 명시) 일 때 활성.
 * 통합 테스트가 본문에서 인증코드를 추출해 confirm 까지 검증할 수 있게 한다.
 */
@Component
@ConditionalOnProperty(name = "email.provider", havingValue = "stub")
public class StubEmailSender implements EmailSender {

    private final AtomicReference<EmailMessage> lastMessage = new AtomicReference<>();

    @Override
    public void send(EmailMessage emailMessage) {
        lastMessage.set(emailMessage);
    }

    public EmailMessage lastMessage() {
        return lastMessage.get();
    }
}
