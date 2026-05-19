package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.InterviewScheduledEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class InterviewScheduledListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(InterviewScheduledEvent event) {
        String iso = event.interviewAt().toString();
        String dedupKey = "INTERVIEW_SCHEDULED:a=" + event.applicationId() + ":t=" + iso;
        String when = event.interviewAt().format(DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm"));
        String body = event.interviewLocation() == null
                ? when
                : (when + " · " + event.interviewLocation());

        notificationService.createIfAbsent(new CreateNotificationCommand(
                event.userId(),
                NotificationType.INTERVIEW_SCHEDULED,
                event.clubName() + " 면접 일정이 잡혔어요",
                body,
                // 학생용 지원서 상세는 /me/applications/{id} 라우트에 존재한다. 과거에는 /applications/{id}
                // 로 두었으나 해당 라우트가 없어 클릭 시 404 가 나는 결손이었다.
                "/me/applications/" + event.applicationId(),
                Map.of("applicationId", event.applicationId(), "interviewAt", iso),
                dedupKey));
    }
}