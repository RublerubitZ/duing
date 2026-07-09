package com.duing.global.email;

import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Resend API 를 RestClient 로 직접 호출하는 주(primary) MailProvider.
 *
 * <p>공식 SDK(resend-java)는 {@code new OkHttpClient()} 를 하드코딩하여 타임아웃 주입이
 * 불가능하므로, {@code POST /emails} 단일 엔드포인트를 RestClient 로 직접 호출한다.
 *
 * <p>실패는 폴백 가능 여부로 분류해 {@link MailProviderException} 으로 던진다 —
 * 429(무료 플랜 일일 한도 포함)·5xx·타임아웃·네트워크 오류는 일시 장애로 보고 재시도 가능,
 * 그 외 4xx(잘못된 요청)와 미분류 클라이언트 오류는 어디로 보내도 실패하므로 재시도 불가.
 *
 * <p>{@code email.provider=resend} 일 때만 활성. 로컬·CI 환경에서는
 * {@link LoggingEmailSender} 가 대신 등록된다.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "email.provider", havingValue = "resend")
public class ResendMailProvider implements MailProvider {

    private static final int MAX_CAUSE_DEPTH = 10;

    private final RestClient resendRestClient;
    private final ResendProperties resendProperties;

    @Override
    public String name() {
        return "Resend";
    }

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
        } catch (RestClientResponseException httpFailure) {
            int statusValue = httpFailure.getStatusCode().value();
            boolean retryable = statusValue == 429 || httpFailure.getStatusCode().is5xxServerError();
            throw new MailProviderException(String.valueOf(statusValue), retryable, httpFailure);
        } catch (ResourceAccessException networkFailure) {
            String reason = hasTimeoutCause(networkFailure) ? "TIMEOUT" : "NETWORK";
            throw new MailProviderException(reason, true, networkFailure);
        } catch (RestClientException clientFailure) {
            // 요청 직렬화 실패 등 우리 쪽 결함 — 다른 Provider 로 보내도 동일하게 실패한다.
            throw new MailProviderException("CLIENT", false, clientFailure);
        }
    }

    private boolean hasTimeoutCause(Throwable failure) {
        Throwable cause = failure;
        for (int depth = 0; cause != null && depth < MAX_CAUSE_DEPTH; depth++) {
            if (cause instanceof SocketTimeoutException) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }
}
