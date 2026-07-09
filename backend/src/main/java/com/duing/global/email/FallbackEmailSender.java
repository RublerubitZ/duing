package com.duing.global.email;

import com.duing.global.email.exception.EmailException;
import java.util.List;
import lombok.extern.slf4j.Slf4j;

/**
 * Provider 체인을 순서대로 시도하는 EmailSender — 주 Provider(Resend) 실패 시 폴백(Brevo SMTP).
 *
 * <p>폴백은 {@link MailProviderException#isRetryable() 재시도 가능한 실패}(429/5xx/타임아웃/네트워크)
 * 에서만 일어난다. 잘못된 요청(4xx)·설정 오류 같은 재시도 불가 실패는 어느 Provider 로 보내도
 * 같은 이유로 실패하므로 즉시 중단한다. 최종 실패는 기존과 동일하게
 * {@link EmailException.SendFailedException} 으로 변환되어 호출부 예외 처리(전역 쿼터 복구 등)가
 * 그대로 동작한다.
 *
 * <p>빈 등록·체인 순서는 {@link com.duing.global.config.MailProviderConfig} 가 정의한다
 * ({@code email.provider=resend} 일 때 활성).
 *
 * <p>로깅 정책 — ERROR 는 Sentry 로 전송되므로 PII 를 배제한다: 수신자 이메일은 어느 레벨에도
 * 남기지 않고, 예외 스택은 warn 까지만 붙인다(벤더 4xx 응답 본문이 RestClientResponseException
 * 메시지에 포함되어 수신자 주소 등 PII 가 섞일 수 있음). 실패 상세 진단은 서버 로그의 warn 으로,
 * 사용자에게 실패가 전파되는 최종 실패 신호만 스택 없는 error 로 남긴다.
 */
@Slf4j
public class FallbackEmailSender implements EmailSender {

    private final List<MailProvider> mailProviders;

    public FallbackEmailSender(List<MailProvider> mailProviders) {
        if (mailProviders.isEmpty()) {
            throw new IllegalArgumentException("메일 Provider 체인은 비어 있을 수 없습니다.");
        }
        this.mailProviders = List.copyOf(mailProviders);
    }

    @Override
    public void send(EmailMessage emailMessage) {
        for (int providerIndex = 0; providerIndex < mailProviders.size(); providerIndex++) {
            MailProvider provider = mailProviders.get(providerIndex);
            try {
                provider.send(emailMessage);
                log.info("[Mail] Provider={} SUCCESS", provider.name());
                return;
            } catch (MailProviderException sendFailure) {
                log.warn("[Mail] Provider={} FAILED ({})", provider.name(), sendFailure.reason(), sendFailure);
                boolean hasNextProvider = providerIndex < mailProviders.size() - 1;
                if (sendFailure.isRetryable() && hasNextProvider) {
                    log.info("[Mail] Retry using {}", mailProviders.get(providerIndex + 1).name());
                    continue;
                }
                log.error("[Mail] 발송 최종 실패 — Provider={} ({}), retryable={}",
                        provider.name(), sendFailure.reason(), sendFailure.isRetryable());
                throw new EmailException.SendFailedException();
            }
        }
    }
}
