package com.duing.domain.notification.listener;

import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FeeBillsIssuedEvent;
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
public class FeeBillsIssuedListener {

    private final FeeBillRepository feeBillRepository;
    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FeeBillsIssuedEvent event) {
        String title = event.clubName() + " 회비가 청구되었어요";
        String body = event.billingPeriod() + " · 마감 " + event.dueDate();
        feeBillRepository.findIssuedBillRecipients(event.feePolicyId(), event.billingStartDate())
                .forEach(recipient -> {
                    try {
                        notificationService.createIfAbsent(new CreateNotificationCommand(
                                recipient.userId(), NotificationType.FEE_BILL_ISSUED,
                                title, body, "/me/fees",
                                Map.of("clubId", event.clubId(), "billId", recipient.billId()),
                                "FEE_BILL_ISSUED:b=" + recipient.billId()));
                    } catch (Exception failure) {
                        log.warn("회비 발행 알림 실패: userId={}, billId={}",
                                recipient.userId(), recipient.billId(), failure);
                    }
                });
    }
}
