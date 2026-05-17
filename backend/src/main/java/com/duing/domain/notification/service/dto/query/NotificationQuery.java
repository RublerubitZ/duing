package com.duing.domain.notification.service.dto.query;

import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import java.time.LocalDateTime;

public record NotificationQuery(
        Long id,
        NotificationType type,
        String title,
        String body,
        String linkUrl,
        LocalDateTime readAt,
        LocalDateTime createdAt
) {
    public static NotificationQuery from(Notification notification) {
        return new NotificationQuery(
                notification.getId(),
                notification.getType(),
                notification.getTitle(),
                notification.getBody(),
                notification.getLinkUrl(),
                notification.getReadAt(),
                notification.getCreatedAt()
        );
    }
}
