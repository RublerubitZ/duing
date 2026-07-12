package com.duing.domain.facility.config;

import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.web.client.RestClient;

/**
 * 시설 크롤러 RestClient 빈 + spring-retry 활성화.
 *
 * <p>{@link com.duing.global.config.BankApiClientConfig} 패턴을 따라 SimpleClientHttpRequestFactory
 * 로 connect/read 타임아웃을 고정한다(§3: connect 3s / read 5s). 온디맨드 조회는 스케줄러 토글과
 * 무관하게 동작해야 하므로 이 설정은 @ConditionalOnProperty 로 게이트하지 않는다.
 *
 * <p>{@link EnableRetry} 는 {@code SchoolFacilityClient} 의 fetchReservations/fetchReservationsOnDemand
 * 재시도 AOP({@code @Retryable})를 켠다.
 */
@Configuration
@EnableRetry
@EnableConfigurationProperties(FacilityCrawlerProperties.class)
public class FacilitySchoolClientConfig {

    @Bean
    public RestClient facilitySchoolRestClient(FacilityCrawlerProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(properties.connectTimeoutMillis()));
        requestFactory.setReadTimeout(Duration.ofMillis(properties.readTimeoutMillis()));
        return RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .build();
    }
}
