package com.duing.global.privacy;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * PII 보관기간 파기 잡의 설정 바인딩 — {@link RetentionProperties} 를 무조건 등록한다.
 * {@link PiiRetentionJob} 은 잡이 비활성일 때도 properties 를 읽어 early-return 하므로 바인딩은 항상 유지해야 한다
 * (그래서 이 바인딩 설정은 조건부로 만들지 않는다 — 조건부로 만들면 비활성 환경에서 PiiRetentionJob 의 의존성이 사라진다).
 *
 * <p>스케줄링 활성화는 {@link PiiRetentionJobConfig} 가 {@code duing.privacy.retention.enabled=true} 일 때만 켠다.
 * 모든 {@code @Scheduled} 잡이 자기 플래그로 격리돼 있어(빈 레벨 {@code @ConditionalOnProperty}, 단 PiiRetentionJob 은
 * 내부 {@code enabled}/window 런타임 가드), 어느 설정이 전역 스케줄러를 켜더라도 비활성 잡이 함께 발화하지 않는다.
 */
@Configuration
@EnableConfigurationProperties(RetentionProperties.class)
public class PrivacyRetentionConfig {
}
