package com.duing.domain.notification.job;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매 정시(Asia/Seoul)에 실행되는 면접 리마인더 잡.
 * 현재 시각 기준 23h ~ 25h 이내에 면접이 예정된(INTERVIEW_PENDING) 지원자에게 알림을 전송한다.
 * {@code duing.notification.jobs.enabled=true} 가 설정된 환경에서만 동작한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class InterviewReminderJob {

    private final ApplicationRepository applicationRepository;
    private final NotificationService notificationService;

    private static final DateTimeFormatter DISPLAY_FORMAT = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void run() {
        LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Seoul"));
        LocalDateTime windowStart = now.plusHours(23);
        LocalDateTime windowEnd = now.plusHours(25);

        List<Application> targets = applicationRepository.findInterviewBetween(windowStart, windowEnd);
        log.info("InterviewReminderJob start: targets={}", targets.size());

        int created = 0;
        for (Application application : targets) {
            try {
                boolean inserted = notificationService.createIfAbsent(buildReminderCommand(application));
                if (inserted) {
                    created++;
                }
            } catch (Exception failure) {
                log.warn("면접 리마인더 알림 실패: applicationId={}", application.getId(), failure);
            }
        }
        log.info("InterviewReminderJob done: created={}", created);
    }

    private CreateNotificationCommand buildReminderCommand(Application application) {
        String isoInterviewAt = application.getInterviewAt().toString();
        String clubName = application.getRecruitment().getClub().getName();
        String when = application.getInterviewAt().format(DISPLAY_FORMAT);
        String body = application.getInterviewLocation() == null
                ? when
                : (when + " · " + application.getInterviewLocation());

        return new CreateNotificationCommand(
                application.getUser().getId(),
                NotificationType.INTERVIEW_REMINDER,
                clubName + " 면접 하루 전",
                body,
                "/applications/" + application.getId(),
                Map.of("applicationId", application.getId(), "interviewAt", isoInterviewAt),
                "INTERVIEW_REMINDER:a=" + application.getId() + ":t=" + isoInterviewAt
        );
    }
}