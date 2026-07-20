package com.duing.domain.notification.controller.dto.response;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.dto.query.NotificationQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record NotificationResponse(
        String source,              // "PERSONAL" | "BROADCAST"
        Long id,
        NotificationType type,      // null for BROADCAST
        String title,
        String body,
        String linkUrl,
        boolean isRead,             // canonical read flag (PERSONAL: readAt != null, BROADCAST: from slice)
        Instant readAt,             // null for BROADCAST or unread PERSONAL
        Instant createdAt
) {
    public static NotificationResponse from(NotificationQuery query) {
        return new NotificationResponse(
                "PERSONAL",
                query.id(),
                query.type(),
                query.title(),
                query.body(),
                query.linkUrl(),
                query.readAt() != null,
                TimeMapper.systemWallClockToInstant(query.readAt()),
                TimeMapper.systemWallClockToInstant(query.createdAt())
        );
    }

    public static NotificationResponse fromBroadcast(NoticeBroadcast broadcast, boolean isRead) {
        return new NotificationResponse(
                "BROADCAST",
                broadcast.getId(),
                null,
                broadcast.getTitle(),
                broadcast.getBody(),
                broadcast.getLinkUrl(),
                isRead,
                null,
                TimeMapper.systemWallClockToInstant(broadcast.getCreatedAt())
        );
    }
}
