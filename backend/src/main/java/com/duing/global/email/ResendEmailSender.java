package com.duing.global.email;

import com.duing.global.email.exception.EmailException;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Resend API 를 RestClient 로 직접 호출하는 EmailSender 구현체.
 *
 * <p>공식 SDK(resend-java)는 {@code new OkHttpClient()} 를 하드코딩하여 타임아웃 주입이
 * 불가능하므로, {@code POST /emails} 단일 엔드포인트를 RestClient 로 직접 호출한다.
 *
 * <p>{@code email.provider=resend} 일 때만 활성. 로컬·CI 환경에서는
 * {@link LoggingEmailSender} 가 대신 등록된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "email.provider", havingValue = "resend")
public class ResendEmailSender implements EmailSender {

    private final RestClient resendRestClient;
    private final ResendProperties resendProperties;

    @Override
    public void send(EmailMessage emailMessage) {
        try {
            resendRestClient.post()
                    .uri("/emails")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "from", resendProperties.from(),
                            "to", List.of(emailMessage.to()),
                            "subject", emailMessage.subject(),
                            "html", emailMessage.html()
                    ))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException sendFailure) {
            // 수신자 이메일(PII)은 로그에 남기지 않는다 — ERROR 로그는 Sentry 로 전송되므로 PII 유출을 막는다.
            log.error("Resend 이메일 발송 실패", sendFailure);
            throw new EmailException.SendFailedException();
        }
    }
}
