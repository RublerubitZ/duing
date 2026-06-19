package com.duing.domain.fee.job;

import com.duing.domain.fee.repository.FeeBillDueSoonRow;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매일 06:00(Asia/Seoul)에 실행되는 회비 마감 임박 리마인더 크론.
 * 마감(due_date)이 D-3 / D-1 / D-0 인 PENDING·PARTIAL_PAID 청구의 회원에게
 * FEE_BILL_DUE_SOON 인앱 알림을 발송한다(오프셋별 dedupKey 로 멱등).
 * 연체 전이 크론이 마감 다음날에야 돌기 때문에 비어 있던 "마감 당일·임박" 알림 채널을 채운다.
 * {@code duing.fee.reminder.enabled=true} 가 설정된 환경에서만 빈이 등록된다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.fee.reminder", name = "enabled", havingValue = "true")
public class FeeBillDueSoonReminderJob {

    private final FeeBillRepository feeBillRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul") // 매일 06:00 (Asia/Seoul)
    @Transactional(readOnly = true)
    public void run() {
        LocalDate today = LocalDate.now(clock);
        List<LocalDate> dueDates = List.of(today.plusDays(3), today.plusDays(1), today); // D-3 / D-1 / D-0
        List<FeeBillDueSoonRow> targets = feeBillRepository.findDueSoonUnpaidBills(dueDates);
        log.info("FeeBillDueSoonReminderJob start: candidates={}", targets.size());

        int created = 0;
        for (FeeBillDueSoonRow target : targets) {
            try {
                if (notificationService.createIfAbsent(buildCommand(today, target))) {
                    created++;
                }
            } catch (Exception failure) {
                log.warn("회비 마감 임박 리마인더 실패: billId={}, userId={}",
                        target.billId(), target.userId(), failure);
            }
        }
        log.info("FeeBillDueSoonReminderJob done: created={}", created);
    }

    private CreateNotificationCommand buildCommand(LocalDate today, FeeBillDueSoonRow target) {
        int daysLeft = (int) ChronoUnit.DAYS.between(today, target.dueDate());
        String title = switch (daysLeft) {
            case 3 -> "회비 마감이 3일 남았어요";
            case 1 -> "회비 마감이 1일 남았어요";
            default -> "오늘 회비 마감이에요"; // D-0
        };
        String body = target.clubName() + " · " + target.billingPeriod() + " · 마감 " + target.dueDate();
        return new CreateNotificationCommand(
                target.userId(),
                NotificationType.FEE_BILL_DUE_SOON,
                title,
                body,
                "/me/fees?billId=" + target.billId(),
                Map.of("clubId", target.clubId(), "billId", target.billId()),
                "FEE_BILL_DUE_SOON:b=" + target.billId() + ":d=" + daysLeft
        );
    }
}
