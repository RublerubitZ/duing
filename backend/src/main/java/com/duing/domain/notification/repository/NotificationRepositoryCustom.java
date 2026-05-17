package com.duing.domain.notification.repository;

import com.duing.domain.notification.entity.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface NotificationRepositoryCustom {

    Page<Notification> findMine(Long userId, boolean unreadOnly, Pageable pageable);

    int markAllRead(Long userId);
}