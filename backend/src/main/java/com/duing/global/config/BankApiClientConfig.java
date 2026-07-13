package com.duing.global.config;

import com.duing.global.bank.BankApiProperties;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * BANK API(bankapi.co.kr) 연동 RestClient 설정.
 *
 * <p>baseUrl·인증 헤더·타임아웃을 빈 정의에서 고정하는 RestClient 설정 관례를 따른다. 인증은
 * {@code Bearer {apiKey}:{secretKey}} 형식이며 키는 {@link BankApiProperties} 를 통해 환경변수로만
 * 주입된다.
 *
 * <p>외부 은행 API 장애 시 거래 조회가 길게 블로킹되지 않도록 짧은 타임아웃을 강제한다.
 * 거래 내역 조회는 응답이 다소 클 수 있어 read 타임아웃을 connect 보다 넉넉히 둔다.
 */
@Configuration
@EnableConfigurationProperties(BankApiProperties.class)
public class BankApiClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(15);

    @Bean
    public RestClient bankApiRestClient(BankApiProperties bankApiProperties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl(bankApiProperties.baseUrl())
                .defaultHeader(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer " + bankApiProperties.apiKey() + ":" + bankApiProperties.secretKey())
                .requestFactory(requestFactory)
                .build();
    }
}
