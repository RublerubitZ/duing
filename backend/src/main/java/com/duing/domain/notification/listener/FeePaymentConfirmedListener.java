package com.duing.domain.notification.listener;

import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FeePaymentConfirmedEvent;
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
public class FeePaymentConfirmedListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FeePaymentConfirmedEvent event) {
        try {
            if (event.newStatus() == FeeStatus.PAID) {
                notificationService.createIfAbsent(new CreateNotificationCommand(
                        event.userId(), NotificationType.FEE_PAID_CONFIRMED,
                        "회비 납부가 완료되었어요", event.billingPeriod() + " 회비 완납 확인",
                        "/me/fees", Map.of("billId", event.billId()),
                        "FEE_PAID_CONFIRMED:b=" + event.billId()));
            } else if (event.newStatus() == FeeStatus.PARTIAL_PAID || event.newStatus() == FeeStatus.OVERDUE) {
                notificationService.createIfAbsent(new CreateNotificationCommand(
                        event.userId(), NotificationType.FEE_PARTIAL_PAYMENT_CONFIRMED,
                        "회비 일부 납부가 확인되었어요", "남은 금액 " + event.remaining() + "원",
                        "/me/fees", Map.of("billId", event.billId(), "remaining", event.remaining()),
                        "FEE_PARTIAL_PAYMENT_CONFIRMED:p=" + event.paymentId()));
            }
            // PENDING/CANCELLED 은 납부 확인 알림 대상 아님
        } catch (Exception failure) {
            log.warn("회비 납부 확인 알림 실패: userId={}, billId={}", event.userId(), event.billId(), failure);
        }
    }
}
