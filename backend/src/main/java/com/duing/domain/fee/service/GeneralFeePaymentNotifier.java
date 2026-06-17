package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GeneralFeePaymentNotifier implements FeePaymentNotifier {

    private static final String LINK_URL = "/me/fees";

    private final NotificationService notificationService;

    @Override
    public void notifyPaymentConfirmed(FeeBill bill, FeeStatus newStatus, long remaining, Long paymentId) {
        if (newStatus == FeeStatus.PAID) {
            // 완납: 청구 단위로 멱등(같은 청구의 완납 알림은 1회).
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    bill.getUserId(),
                    NotificationType.FEE_PAID_CONFIRMED,
                    "회비 납부가 완료되었어요",
                    bill.getBillingPeriod() + " 회비 완납 확인",
                    LINK_URL,
                    Map.of("billId", bill.getId()),
                    "FEE_PAID_CONFIRMED:b=" + bill.getId()));
            return;
        }
        if (newStatus == FeeStatus.PARTIAL_PAID || newStatus == FeeStatus.OVERDUE) {
            // 부분 납부: 납부 단위로 멱등(분할 입금마다 1회).
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    bill.getUserId(),
                    NotificationType.FEE_PARTIAL_PAYMENT_CONFIRMED,
                    "회비 일부 납부가 확인되었어요",
                    "남은 금액 " + remaining + "원",
                    LINK_URL,
                    Map.of("billId", bill.getId(), "remaining", remaining),
                    "FEE_PARTIAL_PAYMENT_CONFIRMED:p=" + paymentId));
        }
    }
}
