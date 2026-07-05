package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FederationInquiryReceivedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
@Slf4j
public class FederationInquiryReceivedListener {

    private final UserRepository userRepository;
    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FederationInquiryReceivedEvent event) {
        String dedupKey = "federation-inquiry-received:" + event.inquiryId();
        String linkUrl = "/admin/inquiries/" + event.inquiryId();
        // 총동연(ADMIN)은 극소수 — createIfAbsent loop 로 충분(대량이면 broadcaster 방식).
        userRepository.findAllByRole(UserRole.ADMIN).forEach(admin -> {
            try {
                notificationService.createIfAbsent(new CreateNotificationCommand(
                        admin.getId(),
                        NotificationType.FEDERATION_INQUIRY_RECEIVED,
                        "새 1:1 문의가 접수됐어요",
                        event.inquiryTitle(),
                        linkUrl,
                        Map.of("inquiryId", event.inquiryId()),
                        dedupKey));
            } catch (Exception failure) {
                log.warn("FEDERATION_INQUIRY_RECEIVED 알림 실패: adminId={}, inquiryId={}",
                        admin.getId(), event.inquiryId(), failure);
            }
        });
    }
}
