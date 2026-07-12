package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FederationInquiryClosedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
@Slf4j
public class FederationInquiryClosedListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FederationInquiryClosedEvent event) {
        String body = StringUtils.hasText(event.closedReason())
                ? event.closedReason()
                : "답변 없이 종료된 문의입니다. 필요하면 새 문의를 작성해 주세요.";
        try {
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    event.authorId(),
                    NotificationType.FEDERATION_INQUIRY_CLOSED,
                    "문의가 종료됐어요",
                    body,
                    "/me/inquiries/" + event.inquiryId(),
                    Map.of("inquiryId", event.inquiryId()),
                    "FEDERATION_INQUIRY_CLOSED:i=" + event.inquiryId()));
        } catch (Exception failure) {
            log.warn("FEDERATION_INQUIRY_CLOSED 알림 실패: inquiryId={}", event.inquiryId(), failure);
        }
    }
}
