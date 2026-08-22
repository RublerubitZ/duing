package com.duing.global.monitoring;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Slack Incoming Webhook 전송기 — 운영 이벤트 채널용. 핵심 서비스와의 격리가 계약이다:
 * {@link #send} 는 어떤 경우에도 예외를 던지지 않으며, 호출부(리스너)는 커밋 이후 별도 스레드에서 돈다.
 * 바디는 문자열로 직렬화해 보낸다 — Content-Length 가 붙어 chunked 전송을 피한다
 * (SimpleClientHttpRequestFactory 는 6.1+ 에서 스트리밍 기본).
 *
 * <p>재시도 정책: <b>5xx·429 에만 1회</b> — 서버가 거절했음이 확실해 중복 게시가 없다. 타임아웃·네트워크 오류는
 * 요청이 이미 도달했을 수 있어 재시도하지 않는다(같은 메시지가 두 번 올라가는 것보다 한 번 빠지는 편이 낫다).
 * 그 외 4xx(잘못된 바디·폐기된 webhook)는 재시도해도 같다.
 *
 * <p>로깅 정책: {@code RestClientResponseException}/{@code ResourceAccessException} 의 메시지에는 요청 URL(=webhook
 * 시크릿)과 응답 바디가 섞인다 — 예외 객체·메시지를 로그에 싣지 않고 상태코드·클래스명만 남긴다.
 * 최종 실패는 ERROR(→ Sentry 이슈) 로 신호만 남긴다(스택 없음, 메일 제공자 ERROR 정책과 동일).
 *
 * <p>운영에서 URL 누락은 부팅 실패가 아니라 비활성이다(SENTRY_DSN 의 fail-fast 관례를 일부러 따르지 않는다 —
 * 모니터링 설정이 배포를 깨는 경로를 만들지 않기 위해). 대신 부팅 직후 상태를 한 줄 남겨 사일런트 결손을 드러낸다
 * (NotificationJobStatusLogger 전례).
 */
@Slf4j
@Component
public class SlackNotifier {

    private static final int MAX_ATTEMPTS = 2;
    private static final Duration RETRY_DELAY = Duration.ofMillis(500);

    private final boolean enabled;
    private final RestClient slackRestClient;
    private final ObjectMapper objectMapper;

    public SlackNotifier(SlackProperties slackProperties, RestClient slackRestClient, ObjectMapper objectMapper) {
        this.enabled = slackProperties.enabled();
        this.slackRestClient = slackRestClient;
        this.objectMapper = objectMapper;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logStatus() {
        if (enabled) {
            log.info("[Slack 운영 알림] 활성 — 주요 운영 이벤트를 webhook 으로 전송한다(deploy/MONITORING.md).");
        } else {
            log.warn("[Slack 운영 알림] 비활성 — SLACK_WEBHOOK_URL 미설정. 로컬·CI 는 정상이며, 운영이라면 서버 .env 에 주입하라.");
        }
    }

    /** 평문 메시지를 webhook 으로 보낸다. 비활성이면 즉시 반환. 절대 예외를 던지지 않는다. */
    public void send(String text) {
        if (!enabled) {
            log.debug("Slack 운영 알림 비활성(SLACK_WEBHOOK_URL 미설정) — 전송 생략");
            return;
        }
        String payload;
        try {
            payload = objectMapper.writeValueAsString(Map.of("text", text));
        } catch (JsonProcessingException serializationFailure) {
            log.error("Slack 운영 알림 전송 실패 — reason=JSON_SERIALIZATION");
            return;
        }
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                // URI 를 지정하지 않으면 baseUrl(=webhook URL) 그대로 호출된다.
                slackRestClient.post()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(payload)
                        .retrieve()
                        .toBodilessEntity();
                log.debug("Slack 운영 알림 전송 완료(attempt={})", attempt);
                return;
            } catch (RestClientResponseException httpFailure) {
                int statusCode = httpFailure.getStatusCode().value();
                boolean retryable = statusCode >= 500 || statusCode == 429;
                if (retryable && attempt < MAX_ATTEMPTS) {
                    log.warn("Slack 운영 알림 전송 실패(HTTP {}) — {}ms 후 1회 재시도한다.",
                            statusCode, RETRY_DELAY.toMillis());
                    sleepBeforeRetry();
                    continue;
                }
                log.error("Slack 운영 알림 전송 실패 — reason=HTTP_{}", statusCode);
                return;
            } catch (RestClientException transportFailure) {
                log.error("Slack 운영 알림 전송 실패 — reason={}", transportFailure.getClass().getSimpleName());
                return;
            }
        }
    }

    private void sleepBeforeRetry() {
        try {
            Thread.sleep(RETRY_DELAY.toMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
