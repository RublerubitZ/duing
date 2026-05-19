package com.duing.domain.notification.service;

import com.duing.domain.notification.controller.dto.response.NotificationResponse;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface NotificationService {

    /**
     * dedup_key 충돌 시 조용히 무시. 새로 생성됐을 때만 true.
     */
    boolean createIfAbsent(CreateNotificationCommand command);

    Page<NotificationResponse> listMine(Long userId, boolean unreadOnly, Pageable pageable);

    long unreadCount(Long userId);

    void markRead(Long userId, Long notificationId);

    void markAllRead(Long userId);

    void markBroadcastRead(Long userId, Long broadcastId);
}
