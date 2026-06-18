package com.duing.domain.notification.job;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewRoundRepository;
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
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 매 정시(Asia/Seoul)에 실행되는 면접 리마인더 잡.
 * 현재 시각 기준 23h ~ 25h 이내에 시작하는 ASSIGNED 상태 {@code InterviewSchedule} 의 지원자에게 알림을 전송한다.
 * 알림 출처는 {@code InterviewSchedule → InterviewSlot.startTime} 이며,
 * {@code duing.notification.jobs.enabled=true} 가 설정된 환경에서만 동작한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.notification.jobs", name = "enabled", havingValue = "true")
public class InterviewReminderJob {

    private static final DateTimeFormatter DISPLAY_FORMAT = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

    private final InterviewScheduleRepository scheduleRepository;
    private final InterviewSlotRepository slotRepository;
    private final InterviewRoundRepository interviewRoundRepository;
    private final ApplicationRepository applicationRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    public void run() {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime windowStart = now.plusHours(23);
        LocalDateTime windowEnd = now.plusHours(25);

        List<InterviewSchedule> targets = scheduleRepository.findAssignedBetween(windowStart, windowEnd);
        if (targets.isEmpty()) {
            log.info("InterviewReminderJob start: targets=0");
            return;
        }
        log.info("InterviewReminderJob start: targets={}", targets.size());

        // 배치 lookup — schedule 마다 개별 쿼리(N+1) 회피
        Set<Long> slotIds = targets.stream()
                .map(InterviewSchedule::getSlotId)
                .collect(Collectors.toSet());
        Set<Long> roundIds = targets.stream()
                .map(InterviewSchedule::getRoundId)
                .collect(Collectors.toSet());
        Set<Long> applicationIds = targets.stream()
                .map(InterviewSchedule::getApplicationId)
                .collect(Collectors.toSet());

        Map<Long, InterviewSlot> slotById = slotRepository.findAllById(slotIds).stream()
                .collect(Collectors.toMap(InterviewSlot::getId, Function.identity()));
        Map<Long, InterviewRound> roundById = interviewRoundRepository.findAllById(roundIds).stream()
                .collect(Collectors.toMap(InterviewRound::getId, Function.identity()));
        Map<Long, Application> applicationById = applicationRepository
                .findAllWithRecruitmentAndClubByIdIn(applicationIds).stream()
                .collect(Collectors.toMap(Application::getId, Function.identity()));

        int created = 0;
        for (InterviewSchedule schedule : targets) {
            try {
                InterviewSlot slot = slotById.get(schedule.getSlotId());
                if (slot == null) {
                    log.warn("INTERVIEW_REMINDER 알림 생략 — slot 없음: scheduleId={}, slotId={}",
                            schedule.getId(), schedule.getSlotId());
                    continue;
                }

                InterviewRound round = roundById.get(schedule.getRoundId());
                if (round == null) {
                    log.warn("INTERVIEW_REMINDER 알림 생략 — round 없음: scheduleId={}, roundId={}",
                            schedule.getId(), schedule.getRoundId());
                    continue;
                }

                Application application = applicationById.get(schedule.getApplicationId());
                if (application == null) {
                    log.warn("INTERVIEW_REMINDER 알림 생략 — application 없음: scheduleId={}, applicationId={}",
                            schedule.getId(), schedule.getApplicationId());
                    continue;
                }

                // 재배정 race — 스냅샷 조회 후 §6.4 개별 재배정이 일어나면 구 슬롯 기준 리마인더가 나간다.
                // 발송 직전 현재 활성 ASSIGNED 배정을 재조회해 스냅샷과 다르면 skip 한다.
                Optional<InterviewSchedule> currentActiveSchedule = scheduleRepository
                        .findByRoundIdAndApplicationIdAndStatus(schedule.getRoundId(),
                                schedule.getApplicationId(), InterviewScheduleStatus.ASSIGNED);
                if (currentActiveSchedule.isEmpty()
                        || !currentActiveSchedule.get().getId().equals(schedule.getId())) {
                    log.debug("INTERVIEW_REMINDER 알림 생략 — 재배정으로 스냅샷이 stale: "
                                    + "snapshotScheduleId={}, currentScheduleId={}, applicationId={}",
                            schedule.getId(),
                            currentActiveSchedule.map(InterviewSchedule::getId).orElse(null),
                            schedule.getApplicationId());
                    continue;
                }

                boolean inserted = notificationService.createIfAbsent(buildReminderCommand(schedule, slot, round, application));
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
                                                            InterviewRound round,
                                                            Application application) {
        String isoStartTime = slot.getStartTime().toString();
        String clubName = application.getRecruitment().getClub().getName();
        String when = slot.getStartTime().format(DISPLAY_FORMAT);
        String body = round.getLocation() == null
                ? when
                : (when + " · " + round.getLocation());

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
