package com.duing.domain.notification.controller.dto.response;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.dto.query.NotificationQuery;
import java.time.LocalDateTime;

public record NotificationResponse(
        Long id,
        NotificationType type,
        String title,
        String body,
        String linkUrl,
        LocalDateTime readAt,
        LocalDateTime createdAt
) {
    public static NotificationResponse from(NotificationQuery query) {
        return new NotificationResponse(
                query.id(),
                query.type(),
                query.title(),
                query.body(),
                query.linkUrl(),
                query.readAt(),
                query.createdAt()
        );
    }
}