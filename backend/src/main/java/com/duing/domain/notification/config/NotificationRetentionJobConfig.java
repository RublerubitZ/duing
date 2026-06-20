package com.duing.domain.notification.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 알림 보존정책 파기 크론을 활성화하는 설정.
 * {@code duing.notification.jobs.retention.enabled=true} 일 때만 자체 {@code @EnableScheduling} 으로
 * 스케줄러를 켜, 다른 잡 설정의 전역 스케줄러에 무임승차하지 않고 자기 플래그만으로 독립 동작하게 한다
 * (PiiRetentionJobConfig 와 동일 격리 패턴). 비가역 파기라 발화 조건을 자기 플래그로 단일화한다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.notification.jobs.retention", name = "enabled", havingValue = "true")
public class NotificationRetentionJobConfig {
}
