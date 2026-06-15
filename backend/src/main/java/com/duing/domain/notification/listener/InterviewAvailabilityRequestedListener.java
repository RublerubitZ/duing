package com.duing.domain.notification.listener;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.event.InterviewAvailabilityRequestedEvent;
import com.duing.domain.interview.repository.InterviewRoundRepository;
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
 * Availability 요청(발송·재알림·Rule 2 재초대) 시 지원자에게 알림을 생성한다.
 * dedupKey 에 요청 회차(q)가 포함되어 회차마다 새 알림이 가고, 같은 회차의 중복 발행은 걸러진다 (스펙 §8).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InterviewAvailabilityRequestedListener {

    private static final DateTimeFormatter DEADLINE_FORMATTER =
            DateTimeFormatter.ofPattern("MM/dd HH:mm");

    private final NotificationService notificationService;
    private final ApplicationRepository applicationRepository;
    private final InterviewRoundRepository interviewRoundRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(InterviewAvailabilityRequestedEvent event) {
        try {
            Application application = applicationRepository.findWithRecruitmentAndClubById(event.applicationId())
                    .orElse(null);
            if (application == null) {
                log.warn("INTERVIEW_AVAILABILITY_REQUESTED 알림 생략 — application 없음: applicationId={}",
                        event.applicationId());
                return;
            }

            InterviewRound round = interviewRoundRepository.findById(event.roundId())
                    .orElse(null);
            if (round == null) {
                log.warn("INTERVIEW_AVAILABILITY_REQUESTED 알림 생략 — round 없음: roundId={}", event.roundId());
                return;
            }

            String clubName = application.getRecruitment().getClub().getName();
            // 요청이 발화되는 라운드는 COLLECTING(발송 가드가 deadline 을 요구)이라 null 이 아닌 게 정상 —
            // 방어적으로 null 이면 마감 없이 본문을 구성한다.
            String body = round.getAvailabilityDeadline() == null
                    ? "면접 가능 시간을 선택해주세요"
                    : round.getAvailabilityDeadline().format(DEADLINE_FORMATTER) + " 까지 선택해주세요";

            String dedupKey = "INTERVIEW_AVAILABILITY_REQUESTED:r=" + event.roundId()
                    + ":a=" + event.applicationId() + ":q=" + event.requestSequence();

            notificationService.createIfAbsent(new CreateNotificationCommand(
                    application.getUser().getId(),
                    NotificationType.INTERVIEW_AVAILABILITY_REQUESTED,
                    clubName + " 면접 가능 시간을 선택해주세요",
                    body,
                    "/me/applications/" + event.applicationId(),
                    Map.of("applicationId", event.applicationId(), "roundId", event.roundId()),
                    dedupKey));
        } catch (Exception failure) {
            log.warn("INTERVIEW_AVAILABILITY_REQUESTED 알림 처리 실패: roundId={}, applicationId={}",
                    event.roundId(), event.applicationId(), failure);
        }
    }
}
