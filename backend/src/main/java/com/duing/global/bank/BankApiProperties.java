package com.duing.global.bank;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * BANK API(bankapi.co.kr) 연동 설정.
 *
 * <p>인증은 {@code Authorization: Bearer {apiKey}:{secretKey}} 헤더로 보낸다.
 * 키는 환경변수(BANK_API_KEY / BANK_API_SECRET)로만 주입하며 코드·yml 에 하드코딩하지 않는다.
 * 키 미설정 시 자동매칭(거래 조회/계좌 등록) 기능만 비동작하고 그 외 기동에는 영향이 없다.
 */
@ConfigurationProperties(prefix = "bank-api")
public record BankApiProperties(
        String baseUrl,
        String apiKey,
        String secretKey
) {}
