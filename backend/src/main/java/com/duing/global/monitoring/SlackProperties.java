package com.duing.global.monitoring;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Slack 운영 알림(Incoming Webhook) 설정 — {@link SlackClientConfig} 가 등록한다. URL 은 환경변수로만 주입.
 *
 * <p>{@code @Validated} 를 쓰지 않는다 — 빈 값이 "비활성(로컬·CI)" 이라는 정상 상태이기 때문이다.
 * 운영(application-prod.yml)도 {@code ${SLACK_WEBHOOK_URL:}} 로 폴백을 둔다 — 미설정이면 부팅 실패가 아니라 비활성이며, SlackNotifier 가 부팅 직후 WARN 으로 드러낸다.
 */
@ConfigurationProperties(prefix = "monitoring.slack")
public record SlackProperties(String webhookUrl) {

    public boolean enabled() {
        return webhookUrl != null && !webhookUrl.isBlank();
    }
}
