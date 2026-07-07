package com.duing.domain.federation.job;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 문의 파기 잡의 설정 바인딩 — {@link FederationInquiryPurgeProperties} 를 무조건 등록한다
 * ({@code PrivacyRetentionConfig} 전례). {@link FederationInquiryPurgeJob} 은 잡이 비활성일 때도
 * properties 를 읽어 early-return 하므로 바인딩은 항상 유지해야 한다 — 조건부로 만들면 비활성
 * 환경에서 {@link FederationInquiryPurgeJob} 의 의존성이 사라진다.
 *
 * <p>스케줄링 활성화는 {@link FederationInquiryPurgeJobConfig} 가
 * {@code duing.federation-inquiry.purge.enabled=true} 일 때만 켠다.
 */
@Configuration
@EnableConfigurationProperties(FederationInquiryPurgeProperties.class)
public class FederationInquiryPurgePropertiesConfig {
}
