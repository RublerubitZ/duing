package com.duing.domain.notification.job;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.PendingApplicationRow;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.support.OperatorNotificationSupport;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매일 오전 9시 30분(Asia/Seoul)에 실행되는 미처리 지원서 리마인더 잡.
 * 제출 뒤 {@link #PENDING_DAYS}일이 지나도록 SUBMITTED 로 남은 지원서가 있는 모집마다
 * 운영진(회장·임원)에게 APPLICATION_PENDING_REMINDER 를 모집 × 운영진 × 하루 1건 보낸다.
 * 보류(ON_HOLD) 등 한 번이라도 다른 상태로 바뀐 지원서는 운영진이 손댄 것으로 보고 세지 않는다.
 * {@code duing.notification.jobs.enabled=true} 가 설정된 환경에서만 동작한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.notification.jobs", name = "enabled", havingValue = "true")
public class ApplicationPendingReminderJob {

    /** 제출 뒤 이 기간이 지나도록 SUBMITTED 면 리마인더 대상(정확히 7일 전 제출 포함). */
    static final int PENDING_DAYS = 7;

    private final ApplicationRepository applicationRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    // 운영진이 활동하는 오전, 다른 알림 잡(05:00·06:00)과 떨어진 시각.
    @Scheduled(cron = "0 30 9 * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void run() {
        // dedup 날짜는 KST, 제출 시각 경계는 created_at 과 같은 system regime 벽시계로 만든다(TIMEZONE.md).
        LocalDate today = LocalDate.now(clock);
        LocalDateTime submittedBefore = TimeMapper.systemNow(clock).minusDays(PENDING_DAYS);
        List<PendingApplicationRow> candidates = applicationRepository.findPendingReminderCandidates(submittedBefore);
        log.info("ApplicationPendingReminderJob start: candidates={}", candidates.size());

        int created = 0;
        for (PendingApplicationRow row : candidates) {
            List<Long> officerUserIds = clubMemberRepository.findOfficerUserIdsByClubIdIn(List.of(row.getClubId()));
            for (Long officerUserId : officerUserIds) {
                try {
                    if (notificationService.createIfAbsent(buildReminderCommand(officerUserId, row, today))) {
                        created++;
                    }
                } catch (Exception failure) {
                    log.warn("APPLICATION_PENDING_REMINDER 알림 실패: userId={}, recruitmentId={}",
                            officerUserId, row.getRecruitmentId(), failure);
                }
            }
        }
        log.info("ApplicationPendingReminderJob done: created={}", created);
    }

    private CreateNotificationCommand buildReminderCommand(Long officerUserId, PendingApplicationRow row,
                                                           LocalDate today) {
        return new CreateNotificationCommand(
                officerUserId,
                NotificationType.APPLICATION_PENDING_REMINDER,
                "지원서 " + row.getPendingCount() + "건이 " + PENDING_DAYS + "일 넘게 대기 중이에요",
                OperatorNotificationSupport.truncateBody(row.getTitle() + " · 지원자가 결과를 기다리고 있어요"),
                OperatorNotificationSupport.applicantsLink(row.getClubId(), row.getRecruitmentId()),
                Map.of("recruitmentId", row.getRecruitmentId(), "clubId", row.getClubId(),
                        "pendingCount", row.getPendingCount()),
                "APPLICATION_PENDING_REMINDER:r=" + row.getRecruitmentId() + ":on=" + today
        );
    }
}
