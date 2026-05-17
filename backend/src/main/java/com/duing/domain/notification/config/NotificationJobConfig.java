package com.duing.domain.notification.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 스케줄러 잡을 활성화하는 설정 클래스.
 * {@code DUING_NOTIFICATION_JOBS_ENABLED=true} 환경변수(또는 yml 키)가 설정된 경우에만 빈이 등록된다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.notification.jobs", name = "enabled", havingValue = "true")
public class NotificationJobConfig {
}