package com.duing.global.config;

import com.duing.global.email.ResendProperties;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Resend 이메일 서비스 RestClient 설정 — {@link com.duing.global.email.ResendMailProvider} 가 사용.
 *
 * <p>{@code email.provider=resend} 일 때만 활성. {@link ResendProperties} 는
 * 여기서만 등록되어 provider 가 resend 가 아닐 때는 빈 검증이 돌지 않는다 (local 까지 죽이는
 * 자살골 방지).
 *
 * <p>Resend 장애 시 발송 API 가 길게 블로킹되지 않도록 짧은 타임아웃을 강제한다.
 */
@Configuration
@ConditionalOnProperty(name = "email.provider", havingValue = "resend")
@EnableConfigurationProperties(ResendProperties.class)
public class ResendClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

    @Bean
    public RestClient resendRestClient(ResendProperties resendProperties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl("https://api.resend.com")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + resendProperties.apiKey())
                .requestFactory(requestFactory)
                .build();
    }
}
