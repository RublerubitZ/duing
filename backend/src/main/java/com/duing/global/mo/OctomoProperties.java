package com.duing.global.mo;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Octomo 연동 설정 — mo.provider=octomo 일 때만 등록된다 (OctomoClientConfig). 키는 환경변수로만 주입.
 *
 * <p>다른 XxxProperties 와 달리 {@code @Validated} 를 쓰지 않는다 — 필수값이 apiKey 하나뿐이라
 * OctomoClientConfig 의 수동 fail-fast(한국어 진단 메시지)로 갈음한다.
 */
@ConfigurationProperties(prefix = "octomo")
public record OctomoProperties(String apiKey, String baseUrl) {
}
