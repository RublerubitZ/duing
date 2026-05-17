package com.duing.domain.notification.service.dto.command;

import com.duing.domain.notification.entity.NotificationType;
import java.util.Map;

public record CreateNotificationCommand(
        Long userId,
        NotificationType type,
        String title,
        String body,
        String linkUrl,
        Map<String, Object> payload,
        String dedupKey
) {}