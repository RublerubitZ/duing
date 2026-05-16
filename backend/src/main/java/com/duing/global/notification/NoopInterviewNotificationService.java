package com.duing.global.notification;

import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

// Phase 5 에서 메일·카카오 알림 구현체가 추가되면 그 구현체에 @Primary 를 붙여 우선순위를 가져가도록 한다.
// 이전에는 @ConditionalOnMissingBean(InterviewNotificationService.class) 를 사용했으나, 자기 자신을
// 가리키는 모순이 되어 Spring 컨텍스트 로딩 시점에 어떤 bean 도 등록되지 않는 회귀를 일으켰다.
@Slf4j
@Service
public class NoopInterviewNotificationService implements InterviewNotificationService {

    @Override
    public void notifyInterviewScheduled(Long applicationId, String recipientEmail,
                                         LocalDateTime scheduledAt, String location) {
        log.info("[InterviewNotification:NOOP] application={}, email={}, at={}, location={}",
                applicationId, recipientEmail, scheduledAt, location);
    }
}