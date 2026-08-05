package com.duing.domain.notification.listener;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.event.InterviewCancelledEvent;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 면접 일정 취소 시 알림을 생성한다.
 *
 * <p>현재 프로덕션 코드에 {@link InterviewCancelledEvent} 발행처가 없다 — 죽은 코드가 아니라 정책의
 * 결과다. 라운드 취소는 일정이 통보되지 않은 라운드에만 허용되고(SCHEDULED 라운드는 도메인이 취소를
 * 거부한다) 그래서 알릴 학생이 없다. 이 리스너가 받는 것은 개별 면접 취소이며, 그 기능이 생기면
 * 그대로 자리를 받는다. 지우려면 NotificationType.INTERVIEW_CANCELLED 와 그 저장 계약까지 함께
 * 정리해야 하므로 존치가 더 싸다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InterviewCancelledListener {

    private final NotificationService notificationService;
    private final ApplicationRepository applicationRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(InterviewCancelledEvent event) {
        if (event.slotId() == null) {
            log.debug("InterviewCancelledEvent with null slotId — slotId 없음, 알림 생략");
            return;
        }
        try {
            Application application = applicationRepository.findWithRecruitmentAndClubById(event.applicationId())
                    .orElse(null);
            if (application == null) {
                log.warn("INTERVIEW_CANCELLED 알림 생략 — application 없음: applicationId={}",
                        event.applicationId());
                return;
            }

            Long userId = application.getUser().getId();
            String clubName = application.getRecruitment().getClub().getName();

            String dedupKey = "INTERVIEW_CANCELLED:a=" + event.applicationId();
            String title = clubName + " 면접 일정이 취소되었어요";
            String body = "면접 일정이 취소되었습니다";
            String linkUrl = "/me/applications/" + event.applicationId();

            notificationService.createIfAbsent(new CreateNotificationCommand(
                    userId,
                    NotificationType.INTERVIEW_CANCELLED,
                    title,
                    body,
                    linkUrl,
                    Map.of("applicationId", event.applicationId()),
                    dedupKey));
        } catch (Exception failure) {
            log.warn("INTERVIEW_CANCELLED 알림 처리 실패: applicationId={}", event.applicationId(), failure);
        }
    }
}
