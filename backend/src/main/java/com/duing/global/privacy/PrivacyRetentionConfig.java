package com.duing.global.privacy;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * PII 보관기간 파기 잡 설정 — RetentionProperties 바인딩.
 *
 * <p>스케줄링: 별도 {@code @EnableScheduling} 을 두지 않는다. {@code @EnableScheduling} 은 전역이라
 * 여기서 추가하면 알림 잡(DeadlineNotificationJob/InterviewReminderJob, @Component @Scheduled)이
 * {@code duing.notification.jobs.enabled=false} 인 환경에서도 발화하는 회귀가 생기기 때문이다.
 * {@link PiiRetentionJob} 은 앱의 기존 스케줄러(운영 기본값으로 활성)에 함께 등록되며, 실제 수행
 * 여부는 잡 내부의 {@code enabled} 가드로 독립 제어한다.
 */
@Configuration
@EnableConfigurationProperties(RetentionProperties.class)
public class PrivacyRetentionConfig {
}
