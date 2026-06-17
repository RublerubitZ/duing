package com.duing.global.bank;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * BANK API(bankapi.co.kr) 연동 설정.
 *
 * <p>인증은 {@code Authorization: Bearer {apiKey}:{secretKey}} 헤더로 보낸다.
 * 키는 환경변수(BANK_API_KEY / BANK_API_SECRET)로만 주입하며 코드·yml 에 하드코딩하지 않는다.
 * 키 미설정 시 자동매칭(거래 조회/계좌 등록) 기능만 비동작하고 그 외 기동에는 영향이 없다.
 *
 * <p>{@code baseUrl} 은 기동에 필수이므로 {@link NotBlank} 로 fail-fast 한다.
 * apiKey/secretKey 는 환경변수 주입이며 dev/test 에선 비어 있을 수 있어 선택 항목으로 둔다.
 */
@Validated
@ConfigurationProperties(prefix = "bank-api")
public record BankApiProperties(
        @NotBlank String baseUrl,
        String apiKey,
        String secretKey
) {}
