package com.duing.domain.notification.listener;

import com.duing.domain.interview.event.InterviewScheduledEvent;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 면접 배정 완료 시 알림을 생성한다.
 *
 * <p>NOTE(Task 1 — 임시 단순화): InterviewScheduledEvent 시그니처가
 * (applicationId, userId, clubName, interviewAt, interviewLocation)
 * → (applicationId, slotId, recruitmentId) 로 변경됐다.
 * userId 는 ApplicationRepository, 슬롯 시작 시간·동아리명은 InterviewSlotRepository 로
 * 조회해야 하지만 두 repository 모두 아직 존재하지 않는다.
 * Task 9 머지 시점에 두 repository 를 주입하고 알림 본문을 완성한다.
 * 그때까지는 userId 를 조회할 수 없으므로 알림 생성을 건너뛰고 경고 로그만 남긴다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InterviewScheduledListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(InterviewScheduledEvent event) {
        // TODO(Task 9): slotId null 가드 제거 후 호출자에서 정리
        if (event.slotId() == null) {
            log.debug("InterviewScheduledEvent with null slotId — legacy path, skipping notification");
            return;
        }
        try {
            // TODO(Task 9): ApplicationRepository 로 userId 조회,
            //               InterviewSlotRepository 로 startTime·동아리명 조회 후 본문 완성
            log.info("INTERVIEW_SCHEDULED 이벤트 수신 — applicationId={}, slotId={}, recruitmentId={}. "
                    + "알림 생성은 Task 9 완료 후 활성화됩니다.",
                    event.applicationId(), event.slotId(), event.recruitmentId());
        } catch (Exception failure) {
            log.warn("INTERVIEW_SCHEDULED 알림 처리 실패: applicationId={}, slotId={}",
                    event.applicationId(), event.slotId(), failure);
        }
    }

    /**
     * Task 9 완료 후 아래 메서드를 {@code handle} 본문으로 교체한다.
     * userId 와 slotStartTime, clubName 을 주입받으면 이 형태로 알림을 생성한다.
     */
    @SuppressWarnings("unused")
    private void createNotification(Long userId, Long applicationId, Long slotId,
                                     String slotStartTime, String clubName) {
        String dedupKey = "INTERVIEW_SCHEDULED:a=" + applicationId + ":s=" + slotId;
        String title = clubName + " 면접 일정이 잡혔어요";
        String body = slotStartTime;
        String linkUrl = "/me/applications/" + applicationId;

        notificationService.createIfAbsent(new CreateNotificationCommand(
                userId,
                NotificationType.INTERVIEW_SCHEDULED,
                title,
                body,
                linkUrl,
                Map.of("applicationId", applicationId, "slotId", slotId),
                dedupKey));
    }
}
