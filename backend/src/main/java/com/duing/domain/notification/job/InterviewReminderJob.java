package com.duing.domain.notification.job;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.time.Clock;
import java.time.LocalDateTime;
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
 * 현재 시각 기준 23h ~ 25h 이내에 시작하는 ASSIGNED 상태 {@code InterviewSchedule} 의 지원자에게 알림을 전송한다.
 * 알림 출처는 {@code InterviewSchedule → InterviewSlot.startTime} 이며,
 * {@code duing.notification.jobs.enabled=true} 가 설정된 환경에서만 동작한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class InterviewReminderJob {

    private static final DateTimeFormatter DISPLAY_FORMAT = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

    private final InterviewScheduleRepository scheduleRepository;
    private final InterviewSlotRepository slotRepository;
    private final InterviewConfigRepository configRepository;
    private final ApplicationRepository applicationRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void run() {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime windowStart = now.plusHours(23);
        LocalDateTime windowEnd = now.plusHours(25);

        List<InterviewSchedule> targets = scheduleRepository.findAssignedBetween(windowStart, windowEnd);
        log.info("InterviewReminderJob start: targets={}", targets.size());

        int created = 0;
        for (InterviewSchedule schedule : targets) {
            try {
                InterviewSlot slot = slotRepository.findById(schedule.getSlotId()).orElse(null);
                if (slot == null) {
                    log.warn("INTERVIEW_REMINDER 알림 생략 — slot 없음: scheduleId={}, slotId={}",
                            schedule.getId(), schedule.getSlotId());
                    continue;
                }

                InterviewConfig config = configRepository.findByRecruitmentId(schedule.getRecruitmentId())
                        .orElse(null);
                if (config == null) {
                    log.warn("INTERVIEW_REMINDER 알림 생략 — config 없음: scheduleId={}, recruitmentId={}",
                            schedule.getId(), schedule.getRecruitmentId());
                    continue;
                }

                Application application = applicationRepository.findWithRecruitmentAndClubById(
                        schedule.getApplicationId()).orElse(null);
                if (application == null) {
                    log.warn("INTERVIEW_REMINDER 알림 생략 — application 없음: scheduleId={}, applicationId={}",
                            schedule.getId(), schedule.getApplicationId());
                    continue;
                }

                boolean inserted = notificationService.createIfAbsent(buildReminderCommand(schedule, slot, config, application));
                if (inserted) {
                    created++;
                }
            } catch (Exception failure) {
                log.warn("면접 리마인더 알림 실패: scheduleId={}, applicationId={}",
                        schedule.getId(), schedule.getApplicationId(), failure);
            }
        }
        log.info("InterviewReminderJob done: created={}", created);
    }

    private CreateNotificationCommand buildReminderCommand(InterviewSchedule schedule,
                                                            InterviewSlot slot,
                                                            InterviewConfig config,
                                                            Application application) {
        String isoStartTime = slot.getStartTime().toString();
        String clubName = application.getRecruitment().getClub().getName();
        String when = slot.getStartTime().format(DISPLAY_FORMAT);
        String body = config.getLocation() == null
                ? when
                : (when + " · " + config.getLocation());

        return new CreateNotificationCommand(
                application.getUser().getId(),
                NotificationType.INTERVIEW_REMINDER,
                clubName + " 면접 하루 전",
                body,
                // 학생용 지원서 상세는 /me/applications/{id} 라우트에 존재한다.
                "/me/applications/" + application.getId(),
                Map.of(
                        "applicationId", application.getId(),
                        "scheduleId", schedule.getId(),
                        "slotId", slot.getId(),
                        "startTime", isoStartTime
                ),
                "INTERVIEW_REMINDER:a=" + application.getId() + ":t=" + isoStartTime
        );
    }
}
