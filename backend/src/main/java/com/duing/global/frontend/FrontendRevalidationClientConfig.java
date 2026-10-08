package com.duing.global.frontend;

import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 프론트 재생성 트리거 RestClient — {@link FrontendRevalidator} 가 사용.
 *
 * <p>read 타임아웃을 10초로 둔다 — warm-up GET 이 페이지 재생성을 기다릴 수 있다. 호출은 정각 스케줄 스레드(시간당
 * 1회)·매일 00:05 상세 재생성 잡({@code ClubDetailDailyRevalidationJob})의 스케줄 스레드와 동아리 상세 재생성 전용
 * 실행기({@link FrontendRevalidationAsyncConfig}, 단일 스레드)에서만 나가 요청 스레드 예산과 무관하다.
 * 비활성(주소·비밀값 없음)일 때도 빈은 만들어 두되 더미 로컬 주소를 준다 — FrontendRevalidator 가 먼저 걸러
 * 절대 호출되지 않는다.
 */
@Configuration
@EnableConfigurationProperties(FrontendRevalidationProperties.class)
public class FrontendRevalidationClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(10);
    private static final String DISABLED_BASE_URL = "http://localhost:0/frontend-revalidation-disabled";

    @Bean
    public RestClient frontendRevalidationRestClient(FrontendRevalidationProperties frontendRevalidationProperties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl(frontendRevalidationProperties.enabled()
                        ? frontendRevalidationProperties.baseUrl()
                        : DISABLED_BASE_URL)
                .requestFactory(requestFactory)
                .build();
    }
}
