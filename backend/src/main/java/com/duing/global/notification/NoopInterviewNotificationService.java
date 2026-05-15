package com.duing.global.notification;

import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@ConditionalOnMissingBean(InterviewNotificationService.class)
public class NoopInterviewNotificationService implements InterviewNotificationService {

    @Override
    public void notifyInterviewScheduled(Long applicationId, String recipientEmail,
                                         LocalDateTime scheduledAt, String location) {
        log.info("[InterviewNotification:NOOP] application={}, email={}, at={}, location={}",
                applicationId, recipientEmail, scheduledAt, location);
    }
}
