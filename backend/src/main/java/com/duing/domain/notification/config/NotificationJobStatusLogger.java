package com.duing.domain.notification.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * 부팅 직후 알림 스케줄러의 활성 여부를 INFO 로그로 명시한다.
 * NotificationJobConfig 가 @ConditionalOnProperty 로 켜질 때만 등록되는 반면,
 * 본 로거는 항상 등록되어 "잡이 켜져있는가" 를 운영자가 시작 로그에서 즉시 확인하게 한다.
 * 운영 환경에서 환경변수/프로파일 셋업을 잊고 알림이 조용히 안 나가는 결손을 막는 안전망.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationJobStatusLogger {

    private static final String PROPERTY_KEY = "duing.notification.jobs.enabled";

    private final Environment environment;

    @EventListener(ApplicationReadyEvent.class)
    public void logStatus() {
        boolean enabled = environment.getProperty(PROPERTY_KEY, Boolean.class, Boolean.FALSE);
        if (enabled) {
            log.info("[알림 스케줄러] 활성. DeadlineNotificationJob(매일 06:00 KST) + InterviewReminderJob(매시 정각) 등록됨.");
        } else {
            log.info("[알림 스케줄러] 비활성. 마감 임박 / 면접 하루 전 알림이 발송되지 않습니다. "
                    + "운영 환경이라면 prod 프로파일 활성화(spring.profiles.active=prod) 또는 "
                    + "DUING_NOTIFICATION_JOBS_ENABLED=true 환경변수 주입 필요.");
        }
    }
}
