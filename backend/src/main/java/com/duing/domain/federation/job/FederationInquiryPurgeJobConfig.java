package com.duing.domain.federation.job;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 문의 파기 크론을 활성화하는 설정 클래스.
 * {@code duing.federation-inquiry.purge.enabled=true} 일 때만 {@code @EnableScheduling} 으로
 * 스케줄러를 켠다 — 다른 잡 설정의 스케줄러에 무임승차하지 않고 자기 플래그만으로 독립 동작하게 한다
 * ({@code PiiRetentionJobConfig} 와 동일 격리 패턴). 다른 {@code @Scheduled} 잡은 모두 자기
 * 플래그로 격리돼 있어 이 설정이 전역 스케줄러를 켜더라도 함께 깨우지 않는다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.federation-inquiry.purge", name = "enabled", havingValue = "true")
public class FederationInquiryPurgeJobConfig {
}
