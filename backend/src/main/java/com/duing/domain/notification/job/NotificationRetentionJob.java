package com.duing.domain.notification.job;

import com.duing.domain.notification.NotificationRetention;
import com.duing.domain.notification.repository.NotificationRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매일 새벽 5시(Asia/Seoul)에 실행되는 알림 보존정책 파기 잡.
 * 생성 후 {@link NotificationRetention#RETENTION_DAYS}일이 지난 개인 알림(notification)을 물리 삭제한다.
 *
 * <p>일회성 알림은 보관 가치가 없어, {@code PiiRetentionJob} 의 만료 데이터 파기와 동일하게 hard delete 한다.
 * 공지(broadcast)는 notice 도메인과 공유되는 데이터라 파기하지 않고 노출만 30일로 제한한다(조회 쿼리 필터).
 *
 * <p>기본 비활성. {@code duing.notification.jobs.retention.enabled=true} 이고 스케줄링이 켜진
 * ({@code duing.notification.jobs.enabled=true}) 환경에서만 실제로 동작한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "duing.notification.jobs.retention", name = "enabled", havingValue = "true")
public class NotificationRetentionJob {

    private final NotificationRepository notificationRepository;
    private final Clock clock;

    @Scheduled(cron = "0 0 5 * * *", zone = "Asia/Seoul")
    @Transactional
    public void run() {
        LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(NotificationRetention.RETENTION_DAYS);
        int deleted = notificationRepository.deleteCreatedBefore(cutoff);
        log.info("[알림 보존정책] {}일 경과 개인 알림 파기: deleted={}, cutoff={}",
                NotificationRetention.RETENTION_DAYS, deleted, cutoff);
    }
}
