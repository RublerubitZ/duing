package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FederationInquiryAnsweredEvent;
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
public class FederationInquiryAnsweredListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FederationInquiryAnsweredEvent event) {
        try {
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    event.authorId(),
                    NotificationType.FEDERATION_INQUIRY_ANSWERED,
                    "총동연 문의에 답변이 등록됐어요",
                    event.inquiryTitle(),
                    "/me/inquiries/" + event.inquiryId(),
                    Map.of("inquiryId", event.inquiryId()),
                    "federation-inquiry-answered:" + event.inquiryId() + ":" + event.answerId()));
        } catch (Exception failure) {
            log.warn("FEDERATION_INQUIRY_ANSWERED 알림 실패: inquiryId={}", event.inquiryId(), failure);
        }
    }
}
