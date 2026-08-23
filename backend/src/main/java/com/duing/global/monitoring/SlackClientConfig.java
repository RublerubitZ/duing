package com.duing.global.monitoring;

import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Slack Incoming Webhook RestClient — {@link SlackNotifier} 가 사용.
 *
 * <p>webhook URL 에는 시크릿 경로가 들어 있으므로 baseUrl 로만 넣고 요청마다 경로를 조립하지 않는다.
 * 비활성(빈 URL)일 때도 빈은 만들어 두되 더미 로컬 주소를 준다 — SlackNotifier 가 먼저 걸러 절대 호출되지 않는다.
 * 운영 알림이 요청 스레드를 오래 잡지 않도록 짧은 타임아웃을 강제한다(리스너는 @Async 지만 스레드 예산이 작다).
 */
@Configuration
@EnableConfigurationProperties(SlackProperties.class)
public class SlackClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
    private static final String DISABLED_BASE_URL = "http://localhost:0/slack-disabled";

    @Bean
    public RestClient slackRestClient(SlackProperties slackProperties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl(slackProperties.enabled() ? slackProperties.webhookUrl() : DISABLED_BASE_URL)
                .requestFactory(requestFactory)
                .build();
    }
}
