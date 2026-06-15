package com.duing.domain.notification.listener;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.event.InterviewScheduledEvent;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 면접 배정 완료 시 알림을 생성한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InterviewScheduledListener {

    private static final DateTimeFormatter SLOT_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("MM/dd HH:mm");

    private final NotificationService notificationService;
    private final ApplicationRepository applicationRepository;
    private final InterviewSlotRepository interviewSlotRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(InterviewScheduledEvent event) {
        try {
            Application application = applicationRepository.findWithRecruitmentAndClubById(event.applicationId())
                    .orElse(null);
            if (application == null) {
                log.warn("INTERVIEW_SCHEDULED 알림 생략 — application 없음: applicationId={}",
                        event.applicationId());
                return;
            }

            InterviewSlot slot = interviewSlotRepository.findById(event.slotId())
                    .orElse(null);
            if (slot == null) {
                log.warn("INTERVIEW_SCHEDULED 알림 생략 — slot 없음: slotId={}", event.slotId());
                return;
            }

            Long userId = application.getUser().getId();
            String clubName = application.getRecruitment().getClub().getName();
            String slotStartTime = slot.getStartTime().format(SLOT_TIME_FORMATTER);

            String dedupKey = "INTERVIEW_SCHEDULED:a=" + event.applicationId() + ":s=" + event.slotId();
            String title = clubName + " 면접 일정이 잡혔어요";
            String body = slotStartTime;
            String linkUrl = "/me/applications/" + event.applicationId();

            notificationService.createIfAbsent(new CreateNotificationCommand(
                    userId,
                    NotificationType.INTERVIEW_SCHEDULED,
                    title,
                    body,
                    linkUrl,
                    Map.of("applicationId", event.applicationId(), "slotId", event.slotId()),
                    dedupKey));
        } catch (Exception failure) {
            log.warn("INTERVIEW_SCHEDULED 알림 처리 실패: applicationId={}, slotId={}",
                    event.applicationId(), event.slotId(), failure);
        }
    }
}
