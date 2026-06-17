package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FeeBillOverdueEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
@Slf4j
public class FeeBillOverdueListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FeeBillOverdueEvent event) {
        try {
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    event.userId(), NotificationType.FEE_BILL_OVERDUE,
                    "회비가 연체되었어요", event.billingPeriod() + " 회비 납부 기한이 지났어요",
                    "/me/fees", Map.of("billId", event.billId()),
                    "FEE_BILL_OVERDUE:b=" + event.billId()));
        } catch (Exception failure) {
            log.warn("회비 연체 알림 실패: userId={}, billId={}", event.userId(), event.billId(), failure);
        }
    }
}
