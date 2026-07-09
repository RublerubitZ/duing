package com.duing.global.config;

import com.duing.global.mo.OctomoProperties;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Octomo RestClient 설정 — {@link com.duing.global.mo.OctomoMoVerificationClient} 가 사용.
 *
 * <p>{@code mo.provider=octomo} 일 때만 활성 (로컬·CI 는 stub 이라 빈·프로퍼티 검증이 아예 등록되지
 * 않는다 — ResendClientConfig 의 "자살골 방지"와 동일 구조). 인증은 공식 샘플 계약대로
 * {@code Authorization: Octomo {API_KEY}} 헤더. Octomo 장애 시 상태조회 API 가 길게 블로킹되지
 * 않도록 짧은 타임아웃을 강제한다.
 */
@Configuration
@ConditionalOnProperty(name = "mo.provider", havingValue = "octomo")
@EnableConfigurationProperties(OctomoProperties.class)
public class OctomoClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

    @Bean
    public RestClient octomoRestClient(OctomoProperties octomoProperties) {
        if (octomoProperties.apiKey() == null || octomoProperties.apiKey().isBlank()) {
            // 실조회 모드에서 키 미주입은 전 요청 401 의 조용한 장애가 된다 — 부팅에서 즉시 실패시킨다.
            throw new IllegalStateException(
                    "mo.provider=octomo 인데 OCTOMO_API_KEY 가 비어 있습니다. 배포 환경변수를 확인하세요.");
        }
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl(octomoProperties.baseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Octomo " + octomoProperties.apiKey())
                .requestFactory(requestFactory)
                .build();
    }
}
